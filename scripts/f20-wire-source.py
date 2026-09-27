"""One-shot exact-blob source transformation for PR57 F20.

No network, database, activation or credential access. This recipe is retained
for reproducibility. Its workflow publisher is retired after the source commit.
"""
from pathlib import Path
import hashlib
import json

changed = {}
def edit(path, expected, replacements):
    p = Path(path)
    before = p.read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(before)).encode() + b'\0' + before).hexdigest()
    assert actual == expected, 'Exact input blob required: ' + path
    text = before.decode()
    for old, new, count in replacements:
        assert text.count(old) == count, 'Exact source anchor required: ' + path
        text = text.replace(old, new)
    assert text != before.decode()
    p.write_text(text)
    data = p.read_bytes()
    changed[path] = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

edit('components/enhanced-contact-form.tsx', 'ce98f85a985897513bfd9b6dda2fb8c45a49c790', [
 ("import { parseBudgetRange } from '@/lib/contact/intake-contract';", """import { parseBudgetRange } from '@/lib/contact/intake-contract';
import { useContactConsentPolicy } from '@/hooks/use-contact-consent-policy';
import { CONSENT_STALE_MESSAGE, CONSENT_UNAVAILABLE_MESSAGE } from '@/lib/contact/consent-client';""", 1),
 ("  const [isSubmitting, setIsSubmitting] = useState(false);", """  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = React.useRef(false);
  const { policy: consentPolicy, loading: policyLoading, error: policyError, refresh: refreshPolicy, replacePolicy } = useContactConsentPolicy();""", 1),
 ("    if (!formData.gdprConsent) {", """    if (!consentPolicy) {
      newErrors.gdprConsent = CONSENT_UNAVAILABLE_MESSAGE;
      missingFields.push('Current Data & Privacy policy');
    } else if (!formData.gdprConsent) {""", 1),
 ("    e.preventDefault();\n\n    const validation", "    e.preventDefault();\n    if (submittingRef.current || uploading || policyLoading) return;\n\n    const validation", 1),
 ("    setIsSubmitting(true);\n\n    try {", """    if (!consentPolicy) return;
    const displayedConsentVersion = consentPolicy.version;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {""", 1),
 ("            formFields.append('gdprConsent', formData.gdprConsent ? 'true' : 'false');", """      formFields.append('gdprConsent', formData.gdprConsent ? 'true' : 'false');
      formFields.append('consentPolicyVersion', displayedConsentVersion);""", 1),
 ("      if (!response.ok) {\n        throw new Error('Contact submission rejected.');", """      if (response.status === 409 && result?.code === 'consent_stale') {
        // Keep all draft fields and uploaded metadata; never retry or recheck.
        setFormData(previous => ({ ...previous, gdprConsent: false }));
        replacePolicy(result.policy);
        setErrors({ gdprConsent: CONSENT_STALE_MESSAGE });
        requestAnimationFrame(() => gdprConsentRef.current?.focus());
        return;
      }
      if (result?.code === 'consent_unavailable') {
        setFormData(previous => ({ ...previous, gdprConsent: false }));
        replacePolicy(null);
        setErrors({ gdprConsent: CONSENT_UNAVAILABLE_MESSAGE });
        return;
      }
      if (!response.ok) {
        throw new Error('Contact submission rejected.');""", 1),
 ("    } finally {\n      setIsSubmitting(false);", "    } finally {\n      submittingRef.current = false;\n      setIsSubmitting(false);", 1),
 ("            {!uploading && attachedFiles.length === 0 && !uploadError && (", "            {!uploading && !uploadError && (", 1),
 ("                Accepted: PDF, Word, Excel, PNG, JPG, ZIP. Files are stored privately and deleted after 90 days.", "                {consentPolicy?.attachmentNotice ?? 'Accepted: PDF, Word, Excel, PNG, JPG, ZIP. Files are stored privately and deleted after 90 days.'}", 1),
 ("        {/* GDPR Consent */}", """        {policyLoading && <p role="status" className="text-sm text-muted-foreground">Loading the current Data & Privacy policy...</p>}
        {policyError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{policyError}</p>
            <Button type="button" variant="outline" disabled={policyLoading || isSubmitting} onClick={() => {
              setFormData(previous => ({ ...previous, gdprConsent: false }));
              void refreshPolicy();
            }}>Load privacy policy again</Button>
          </div>
        )}
        {/* GDPR Consent */}""", 1),
 ("            onCheckedChange={(checked) => handleInputChange('gdprConsent', !!checked)}", """            onCheckedChange={(checked) => handleInputChange('gdprConsent', checked === true)}
            disabled={!consentPolicy || policyLoading || isSubmitting}
            aria-describedby={errors.gdprConsent ? 'gdprConsent-error consent-policy-text' : 'consent-policy-text'}""", 1),
 ("""              I agree that my data will be used to review and respond to my request, as described on the{" "}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                Data & Privacy page
              </Link>.""", """              {consentPolicy ? consentPolicy.checkbox : <>I agree that my data will be used to review and respond to my request, as described on the{" "}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Data & Privacy page
              </Link>.</>}""", 1),
 ("""              <p className="text-xs text-destructive mt-2" role="alert">
                {errors.gdprConsent}""", """              <p id="gdprConsent-error" className="text-xs text-destructive mt-2" role="alert">
                {errors.gdprConsent}""", 1),
 ("        {/* Privacy Notice */}", """        {consentPolicy && (
          <details id="consent-policy-text" open={!!errors.gdprConsent} className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">Data & Privacy policy for this request ({consentPolicy.version})</summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{consentPolicy.policyText}</p>
          </details>
        )}
        {/* Privacy Notice */}""", 1),
 ("""            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Privacy & Data Usage:</span>""", """            {consentPolicy ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{consentPolicy.privacyNotice}</p> : <>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Privacy & Data Usage:</span>""", 1),
 ("""              Note: Technical data (device type, browser info) is collected automatically for security and spam prevention purposes only.
            </p>""", """              Note: Technical data (device type, browser info) is collected automatically for security and spam prevention purposes only.
            </p>
            </>}""", 1),
 ("disabled={isSubmitting || uploading || (TURNSTILE_SITE_KEY ? !isTurnstileVerified : false)}", "disabled={isSubmitting || uploading || policyLoading || !consentPolicy || (TURNSTILE_SITE_KEY ? !isTurnstileVerified : false)}", 1),
])

edit('lib/contact/consent-policy.ts','3b4fbc4ee10320eb6f4b835835f774de580d8cfb',[
 ("""/** I03 infrastructure only. No live route imports this module. No env switch,
 * published policy, migration activation, backfill or marketing permission.
 * Explicit future approval is required to wire a database-backed control into
 * intake. Synthetic registry/control inputs are supplied by isolated tests.""", """/** I03/F20 development integration approved 2026-09-28. No environment switch,
 * automatic activation, backfill or marketing permission. The runtime control
 * comes from the database; schema installation leaves it disabled. Production
 * migration, policy publication and activation require separate authorization.""",1),
 ("export const CONSENT_ACTIVATION_ENABLED = false;", "// Deployment default only; not an environment override of database authority.\nexport const CONSENT_ACTIVATION_ENABLED = false;",1),
])
edit('tests/reliability/consent-policy.test.mjs','4347a4e8de1b215cb95e8ca2c940a4ab11f42ebf',[
 ("test('existing intake remains unwired and policy text is not published by infrastructure',()=>{", "test('intake never publishes synthetic policy wording or enables capture by environment',()=>{",1),
 ("assert.doesNotMatch(source,/from ['\"][^'\"]*consent-policy/);", "",1),
])
edit('scripts/audit-manifests.mjs','87d77b5aeaab5e19c8dcdcdd858b8560cd8cec69',[
 ("['app/api/contact/route.ts','/api/contact/route',['POST']]", "['app/api/contact/route.ts','/api/contact/route',['GET','POST']]",1),
])
edit('tests/reliability/contact.test.mjs','12c7ff6213c2be2dd355fa8cb9bc8180f87a1f50',[
 ("const modules={", """const modules={
 '@/lib/contact/consent-intake':'export async function parseConsentedLeadPayload() { return {ok:true,lead:{attachments:[]}}; }',
 '@/lib/contact/consent-control':'export async function readConsentControl() { throw Error("Unexpected policy read"); }',""",1),
])
edit('tests/reliability/caller-inventory.test.mjs','abd4b16c38a15377d011b7dea984cb95f8e240cb',[
 ("const modules = {", """const modules = {
  '@/lib/contact/consent-intake': 'export async function parseConsentedLeadPayload(){throw Error("Unexpected consent intake");}',
  '@/lib/contact/consent-control': 'export async function readConsentControl(){throw Error("Unexpected policy read");}',""",1),
 ("  assert.equal(typeof contactRoute.POST, 'function');", "  assert.equal(typeof contactRoute.POST, 'function');\n  assert.equal(typeof contactRoute.GET, 'function');",1),
])
edit('tests/reliability/intake-consent.test.mjs','d9e2efb9e8e3d93d2aed49a3da362e86419e91a3',[
 ("import test from 'node:test';", "import test from 'node:test';\nimport {consentBundle,consentSnapshot} from './consent-fixture.mjs';",1),
 ("  rateLimits: new Map(),", "  consentSnapshot,\n  rateLimits: new Map(),",1),
 ("        if (name === 'consume_rate_limit') {", "        if (name === 'contact_consent_control') return {data:s.consentSnapshot,error:null};\n        if (name === 'consume_rate_limit') {",1),
 ("    if (specifier === '@/lib/contact/intake-contract') {", """    if (specifier.startsWith('@/lib/contact/consent-')) {
      return {url:new URL('../../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
    }
    if (specifier === '@/lib/contact/intake-contract') {""",1),
 ("  f.set('gdprConsent', 'true');", "  f.set('gdprConsent', 'true');\n  f.set('consentPolicyVersion', consentBundle.version);",1),
])
edit('tests/acceptance/disposable-bootstrap.mjs','f072a1afa6e255b4f53e43cd8cc2ad39fe76de3d',[
 ("ordered.length,40,'Expected reviewed migrations 0001 through 0040'", "ordered.length,41,'Expected reviewed migrations 0001 through 0041'",1),
 ("sql(state,'select count(*) from bootstrap_internal.migrations;'),'40'", "sql(state,'select count(*) from bootstrap_internal.migrations;'),'41'",1),
])
edit('tests/reliability/disposable-bootstrap.test.mjs','3e7c9c9ca1dab7e31e6d1378cccb6467f3a2cd41',[
 ("Array.from({length:40}", "Array.from({length:41}",2),
 ("assert.equal(result.length,40)", "assert.equal(result.length,41)",1),
])
edit('tests/reliability/contact-pipeline.acceptance.mjs','c4322283402c21fdde5087969174495603ad6868',[
 ("import test from 'node:test';","import test from 'node:test';\nimport {installConsentFixture} from './consent-ci-fixture.mjs';",1),
 (" try{\n  await storage.send", " let consentFixture;\n try{\n  consentFixture=installConsentFixture();\n  await storage.send",1),
 ("form.set('gdprConsent',consent);", "form.set('gdprConsent',consent);form.set('consentPolicyVersion',consentFixture.bundle.version);",1),
 ("select('ticket_number,attachments,consent_at,user_agent')", "select('ticket_number,attachments,consent_at,user_agent,consent_policy_version,consent_policy_hash,consent_capture_method')",1),
 ("assert.equal(row.user_agent,'Synthetic pipeline acceptance');", "assert.equal(row.user_agent,'Synthetic pipeline acceptance');assert.equal(row.consent_policy_version,consentFixture.archive.version);assert.equal(row.consent_policy_hash,consentFixture.archive.hash);assert.equal(row.consent_capture_method,'explicit-checkbox-v1');",1),
 ("   safe(await admin.from('leads').delete().eq('email',email));", "   if(consentFixture)consentFixture.dispose();\n   safe(await admin.from('leads').delete().eq('email',email));",1),
])
edit('tests/wave-one-browser.mjs','52bb2df73cbf89f7511ad10fdfa257bcea4cd2ed',[
 ("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport {installConsentFixture} from './reliability/consent-ci-fixture.mjs';",1),
 ("env:{...env,WAVE_ROOT:", "env:{...env,WAVE_CANDIDATE:String(mode==='candidate'),WAVE_ROOT:",1),
 ("let user,project,browser,server,ipIndex=0;", "let user,project,browser,server,consentFixture,ipIndex=0;",1),
 (" const token=randomUUID();f.set('cf-turnstile-response',token);", " if(consentFixture)f.set('consentPolicyVersion',consentFixture.bundle.version);\n const token=randomUUID();f.set('cf-turnstile-response',token);",1),
 (" report.phase='fixtures';user=", " if(process.env.WAVE_CANDIDATE==='true')consentFixture=installConsentFixture();\n report.phase='fixtures';user=",1),
 ("  safe(await admin.from('leads').delete().eq('email',email));", "  if(consentFixture)consentFixture.dispose();\n  safe(await admin.from('leads').delete().eq('email',email));",1),
])

# The challenge now checks the entrypoint used by the real route, not an
# unrelated helper or arbitrary key-name match. Existing explicit-consent
# refusal assertions remain, with full evidence and missing-version checks.
edit('tests/audit-claim-challenges.mjs','a07d326b0345eaee0edf1aaf69809a9cfa6a7a00',[
 ("import {writeFileSync} from 'node:fs';", "import {writeFileSync,readFileSync} from 'node:fs';\nimport {consentBundle,consentArchive,consentSnapshot} from './reliability/consent-fixture.mjs';",1),
 ("async rpc(){f.calls.push('rpc');", "async rpc(name){if(name==='contact_consent_control')return {data:consentSnapshot,error:null};f.calls.push('rpc');",1),
 ("if(['@/lib/crm/thread-pagination','@/lib/contact/intake-contract','@/lib/crm/result'].includes(s))", "if(['@/lib/crm/thread-pagination','@/lib/contact/intake-contract','@/lib/crm/result','@/lib/contact/consent-intake','@/lib/contact/consent-control','@/lib/contact/consent-policy','@/lib/contact/lead-schema'].includes(s))",1),
 ("hooks.deregister();", "const {parseConsentedLeadPayload}=await import('../lib/contact/consent-intake.ts');\nhooks.deregister();",1),
 ("  const r=parseLeadPayload(form('true'),{ipHash:null,userAgent:null});assert.equal(r.ok,true);\n  // Issue45 explicitly asks for policy/version/time. A timestamp alone is not a version.\n  const key=Object.keys(r.lead).find(k=>/policy.*(?:version|hash)|consent.*(?:version|hash)/i.test(k));\n  assert.ok(key&&typeof r.lead[key]==='string'&&r.lead[key].length>0);", """  const meta={ipHash:null,userAgent:null},input=form('true');
  assert.equal((await parseConsentedLeadPayload(input,meta)).ok,false);
  input.set('consentPolicyVersion',consentBundle.version);
  input.set('consent_at','2000-01-01');input.set('consent_policy_hash','forged');
  const before=Date.now(),r=await parseConsentedLeadPayload(input,meta);assert.equal(r.ok,true);
  assert.equal(r.lead.consent_policy_version,consentBundle.version);
  assert.equal(r.lead.consent_policy_hash,consentArchive.hash);
  assert.equal(r.lead.consent_capture_method,'explicit-checkbox-v1');
  assert.ok(Date.parse(r.lead.consent_at)>=before&&Date.parse(r.lead.consent_at)<=Date.now());
  assert.match(readFileSync('app/api/contact/route.ts','utf8'),/await parseConsentedLeadPayload\(form,/);
  assert.match(readFileSync('components/enhanced-contact-form.tsx','utf8'),/formFields\.append\('consentPolicyVersion', displayedConsentVersion\)/);""",1),
])

# Source and real desktop/mobile browser tests exercise the new wire field.
edit('tests/contact-cleanup.mjs','5f0d94fb7170e33639072fc4cb598ec8d7a0f9c4',[
 ("import {spawn} from 'node:child_process';", "import {spawn} from 'node:child_process';\nimport {consentBundle} from './reliability/consent-fixture.mjs';",1),
 ("const fields=['gdprConsent',", "const fields=['gdprConsent','consentPolicyVersion',",1),
 ("new Function('formData','submissionData','attachedFiles','submitToken',", "new Function('formData','submissionData','attachedFiles','submitToken','displayedConsentVersion',",1),
 ("[attachment],'synthetic-token');", "[attachment],'synthetic-token',input.consentPolicyVersion);",1),
 ("input,[],null);", "input,[],null,input.consentPolicyVersion);",1),
 ("        if(u.origin!==base)return route.abort();", """        if(u.href==='https://challenges.cloudflare.com/turnstile/v0/api.js')
          return route.fulfill({contentType:'application/javascript',body:"window.turnstile={reset(){window.onTurnstileSuccess?.('synthetic-'+crypto.randomUUID())}};const timer=setInterval(()=>{if(window.onTurnstileSuccess){clearInterval(timer);window.turnstile.reset();}},25);"});
        if(u.origin!==base)return route.abort();""",1),
 ("        if(u.pathname==='/api/contact'&&route.request().method()==='POST') {", """        if(u.pathname==='/api/contact'&&route.request().method()==='GET')
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({policy:consentBundle})});
        if(u.pathname==='/api/contact'&&route.request().method()==='POST') {""",1),
 ("      assert.deepEqual(payload.getAll('gdprConsent'),['true']);", "      assert.deepEqual(payload.getAll('gdprConsent'),['true']);\n      assert.deepEqual(payload.getAll('consentPolicyVersion'),[consentBundle.version]);",1),
])
edit('.github/workflows/contact-cleanup.yml','1d210e299abe83a6f3f5a233b36bc6fd8a266c64',[
 ("      NEXT_PUBLIC_SITE_URL: https://example.test", "      NEXT_PUBLIC_SITE_URL: https://example.test\n      NEXT_PUBLIC_TURNSTILE_SITE_KEY: synthetic",1),
 ("        run: node tests/contact-cleanup.mjs browser", "        run: |\n          node tests/contact-cleanup.mjs browser\n          node tests/consent-browser.mjs",1),
])
print(json.dumps(changed,sort_keys=True,indent=2))
