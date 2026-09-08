import json,os,pathlib,re,urllib.request
try:
    report=json.loads((pathlib.Path(os.environ['RUNNER_TEMP'])/'reliability-result.json').read_text())
    state='success' if report.get('state')=='success' else 'failure'
    stage=report.get('stage')
    if stage not in ['dependencies','tests','lint','typegen','types','build','all']: stage='unknown'
    detail=report.get('detail','')
    if not isinstance(detail,str) or not re.fullmatch(r'[A-Za-z0-9_/().\[\]:; =-]{0,300}',detail): detail=''
    description=(stage+': '+state+(' '+detail if detail else ''))[:140]
    repository=os.environ['GITHUB_REPOSITORY']
    sha=os.environ['STATUS_SHA']
    if repository!='redwan-cse/redwan.work' or not re.fullmatch('[0-9a-f]{40}',sha): raise ValueError()
    payload={'state':state,'context':'reliability/diagnostic','description':description,'target_url':'https://github.com/'+repository+'/actions/runs/'+os.environ['GITHUB_RUN_ID']}
    request=urllib.request.Request('https://api.github.com/repos/'+repository+'/statuses/'+sha,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['STATUS_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request,timeout=15) as response:
        if response.status!=201: raise ValueError()
    print('Safe verification status published.')
except Exception:
    print('::error::Verification status reporting unavailable; original check result remains authoritative.')
    raise SystemExit(1)
