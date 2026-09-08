"""One bounded source transformation, only on the named development branch.
No checkout mutation, production access, third-party requests, or raw diagnostics.
The Actions token is used only for GitHub blob/tree/commit/ref operations.
"""
import base64,json,os,urllib.parse,urllib.request
API='https://api.github.com/repos/redwan-cse/redwan.work'
BRANCH='fix/consent-diagnostic-contracts'
def api(path,body=None,method=None):
    request=urllib.request.Request(API+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+os.environ['EDIT_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(request,timeout=20) as response:return json.load(response)
def replace(source,old,new):
    if source.count(old)!=1:raise ValueError('source mismatch')
    return source.replace(old,new,1)
def contact(source):
    return replace(source,"      formFields.append('name', submissionData.name);","      formFields.append('gdprConsent', formData.gdprConsent ? 'true' : 'false');\n      formFields.append('name', submissionData.name);")
def schema(source):
    return replace(source,"  const name = nullable(str(formData, 'name'), 200);","  if (formData.getAll('gdprConsent').length !== 1 || formData.get('gdprConsent') !== 'true') {\n    return { ok: false, error: 'Please agree to the Data & Privacy policy before submitting.' };\n  }\n  const name = nullable(str(formData, 'name'), 200);")
def email(source):
    old="function normalizeError(err: unknown): string {\n  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown email error';\n  return truncate(raw, MAX_LOGGED_ERROR);\n}"
    new="function normalizeError(err: unknown): string {\n  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';\n  const safe = new Set([\n    'Invalid recipient address', 'Email is not configured', 'Email provider timeout',\n    'Ticket context unavailable', 'Recipient unavailable', 'No active admin recipients',\n    'Invoice context unavailable', 'Payment context unavailable', 'Deliverable context unavailable',\n    'Existing account claimed; no invite email sent', 'Invitation provider request failed',\n    HANDOFF_MARKER,\n  ]);\n  return safe.has(raw) ? raw : 'Email operation failed';\n}"
    source=replace(source,old,new)
    source=replace(source,"error: input.error ? truncate(input.error, MAX_LOGGED_ERROR) : null,","error: input.error ? normalizeError(input.error) : null,")
    source=replace(source,"if (error) console.error('email_log insert failed:', error.message);","if (error) console.error('email_log insert failed.');")
    source=replace(source,'const MAX_LOGGED_ERROR = 500;\n','')
    return source
try:
    if os.environ.get('GITHUB_REPOSITORY')!='redwan-cse/redwan.work':raise ValueError()
    event=json.load(open(os.environ['GITHUB_EVENT_PATH']))
    head=event.get('pull_request',{}).get('head',{})
    if head.get('ref')!=BRANCH or head.get('repo',{}).get('full_name')!='redwan-cse/redwan.work':raise ValueError()
    base=api('/git/ref/heads/'+BRANCH)['object']['sha']
    specs=[('components/enhanced-contact-form.tsx','400fef2f4c65ffa39b01d0f47c58bdedcce2d0b4',contact),('lib/contact/lead-schema.ts','5e0324a87857319f03a64b81cf5334fc753019b3',schema),('lib/email/index.ts','3b19c0f89233265b032ea1b6d875d97f76cb220f',email)]
    loaded=[]
    for path,expected,transform in specs:
        item=api('/contents/'+urllib.parse.quote(path,safe='/')+'?ref='+base)
        loaded.append((path,expected,transform,item))
    if any(item['sha']!=expected for _,expected,_,item in loaded):
        print('Approved baseline already changed; no source write performed.')
        raise SystemExit(0)
    tree=[]
    for path,_,transform,item in loaded:
        content=transform(base64.b64decode(item['content']).decode())
        blob=api('/git/blobs',{'content':content,'encoding':'utf-8'},'POST')
        tree.append({'path':path,'mode':'100644','type':'blob','sha':blob['sha']})
    commit=api('/git/commits/'+base)
    newtree=api('/git/trees',{'base_tree':commit['tree']['sha'],'tree':tree},'POST')
    newcommit=api('/git/commits',{'message':'fix: require explicit contact consent and sanitize email diagnostics','tree':newtree['sha'],'parents':[base]},'POST')
    api('/git/refs/heads/'+BRANCH,{'sha':newcommit['sha'],'force':False},'PATCH')
    print('Applied three exact-source edits to the named development branch. Main untouched. Fresh-head CI still required.')
except Exception:
    print('::error::Bounded consent source edit failed; no production operation was attempted.')
    raise SystemExit(1)
