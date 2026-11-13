import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposablePostgres, type DisposablePostgres } from '../harness/disposable-pg.mjs';
import {
  archivePolicy,
  consentEvidenceView,
  validateConsentSubmission,
  type ArchivedPolicy,
} from '@/lib/contact/consent-policy';
import { parsePublicConsentPolicy } from '@/lib/contact/consent-client';

const EXPECTED_RATE_LIMIT_KINDS = [
  'ip',
  'turnstile',
  'presign',
  'presign-ip',
  'otp',
  'otp-ip',
  'auth',
  'retry-recovery',
  'retry-invite',
  'portal-presign',
  'password-login',
  'register-ip',
] as const;

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('Consent Policy Contract & Rate-Limit Vocabulary', () => {
  let pg: DisposablePostgres;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[CONSENT-CONTRACT] seeds canonical consent policy compatible with archivePolicy(), stale 409, disabled 503, and inquiries trigger', async () => {
    const res = await pg.queryAs<{ snapshot: { schema: number; activeVersion: string | null; policies: ArchivedPolicy[] } }>(
      { pgRole: 'anon' },
      `select public.contact_consent_control('v1') as snapshot`
    );
    const snapshot = res.rows[0].snapshot;
    expect(snapshot.schema).toBe(1);
    expect(typeof snapshot.activeVersion).toBe('string');
    expect(snapshot.policies.length).toBeGreaterThanOrEqual(1);

    // Every returned policy must pass archivePolicy() and parsePublicConsentPolicy()
    for (const p of snapshot.policies) {
      const parsed = JSON.parse(p.canonical);
      const checked = archivePolicy(parsed);
      expect(checked.canonical).toBe(p.canonical);
      expect(checked.hash).toBe(p.hash);
      expect(parsePublicConsentPolicy(parsed)).not.toBeNull();
    }

    // Active version submission -> ok: true + recorded evidence
    const validForm = new FormData();
    validForm.set('gdprConsent', 'true');
    validForm.set('consentPolicyVersion', snapshot.activeVersion!);
    const okDecision = validateConsentSubmission(
      validForm,
      { activeVersion: snapshot.activeVersion, policies: snapshot.policies },
      () => new Date('2026-11-07T12:00:00.000Z')
    );
    expect(okDecision.ok).toBe(true);
    if (!okDecision.ok) throw new Error('Expected ok consent decision');
    expect(consentEvidenceView(okDecision.evidence, snapshot.policies)).toBe('recorded');

    // Stale v1 submission -> 409 stale
    if (snapshot.activeVersion !== 'v1') {
      const staleForm = new FormData();
      staleForm.set('gdprConsent', 'true');
      staleForm.set('consentPolicyVersion', 'v1');
      const staleDecision = validateConsentSubmission(staleForm, {
        activeVersion: snapshot.activeVersion,
        policies: snapshot.policies,
      });
      expect(staleDecision).toEqual({ ok: false, status: 409, code: 'stale' });
    }

    // DB BEFORE INSERT trigger on public.inquiries enforces active consent hash/version (PT409 on stale)
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.inquiries (
           name, email, project_summary, consent_at,
           consent_policy_version, consent_policy_hash, consent_capture_method
         ) values ($1, $2, $3, now(), $4, $5, 'explicit-checkbox-v1')`,
        ['Lead Test', 'lead@disposable.test', 'Need VAPT scope review', 'v1', '0'.repeat(64)]
      )
    ).rejects.toThrow();

    // Valid active consent inserts cleanly
    const ins = await pg.queryAs<{ code: string }>(
      { pgRole: 'service_role' },
      `insert into public.inquiries (
         name, email, project_summary, consent_at,
         consent_policy_version, consent_policy_hash, consent_capture_method
       ) values ($1, $2, $3, $4, $5, $6, $7)
       returning code`,
      [
        'Valid Lead',
        'valid@disposable.test',
        'Authorized scope security review',
        okDecision.evidence.consent_at,
        okDecision.evidence.consent_policy_version,
        okDecision.evidence.consent_policy_hash,
        okDecision.evidence.consent_capture_method,
      ]
    );
    expect(ins.rows[0].code).toMatch(/^INQ-\d+$/);
  });

  it('[RATE-LIMIT-KINDS] accepts all application rate-limit kinds and enforces window ceilings', async () => {
    for (const kind of EXPECTED_RATE_LIMIT_KINDS) {
      const keyHash = `hash-${kind}-001`;
      const first = await pg.queryAs<{ allowed: boolean }>(
        { pgRole: 'service_role' },
        `select public.consume_rate_limit($1, $2, 300, 1) as allowed`,
        [kind, keyHash]
      );
      expect(first.rows[0].allowed).toBe(true);

      const second = await pg.queryAs<{ allowed: boolean }>(
        { pgRole: 'service_role' },
        `select public.consume_rate_limit($1, $2, 300, 1) as allowed`,
        [kind, keyHash]
      );
      expect(second.rows[0].allowed).toBe(false);
    }

    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `select public.consume_rate_limit('unknown-rogue-kind', 'hash-rogue', 300, 1)`
      )
    ).rejects.toThrow();

    // Dynamic scan across app/ and lib/ to ensure no caller uses an unconstrained kind literal
    const sourceFiles = [
      ...collectSourceFiles(join(process.cwd(), 'app')),
      ...collectSourceFiles(join(process.cwd(), 'lib')),
    ];
    const discoveredKinds = new Set<string>();
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/p_kind:\s*'([a-z0-9-]+)'/g)) {
        discoveredKinds.add(m[1]);
      }
      for (const m of text.matchAll(/consumeRateLimit\(\s*'([a-z0-9-]+)'/g)) {
        discoveredKinds.add(m[1]);
      }
    }
    expect(discoveredKinds.size).toBeGreaterThan(0);
    for (const discovered of discoveredKinds) {
      expect(
        EXPECTED_RATE_LIMIT_KINDS,
        `Rate-limit kind literal "${discovered}" must be in EXPECTED_RATE_LIMIT_KINDS & DB check constraint`
      ).toContain(discovered);
    }
  });
});
