import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposablePostgres, type DisposablePostgres, type TestUserRecord } from '../harness/disposable-pg.mjs';

describe('Atomic Email Outbox Claiming & Per-Client Storage Quotas', () => {
  let pg: DisposablePostgres;
  let client: TestUserRecord;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    client = await pg.createTestUser({
      email: 'storage-client@disposable.test',
      fullName: 'Storage Client',
      role: 'client',
      isActive: true,
    });
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('claims pending email_outbox rows atomically for service_role only, skips future backoffs, and recovers stale processing locks', async () => {
    // anon & authenticated must be denied claim_pending_email_outbox
    await expect(
      pg.queryAs(
        { pgRole: 'anon' },
        `select * from public.claim_pending_email_outbox(10, 300)`
      )
    ).rejects.toThrow(/permission denied/i);

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
        `select * from public.claim_pending_email_outbox(10, 300)`
      )
    ).rejects.toThrow(/permission denied/i);

    // Insert 3 rows: 1 ready pending, 1 future-backoff pending, 1 stale processing lock
    const inserted = await pg.db.query<{ id: string; subject: string }>(
      `insert into public.email_outbox (to_email, subject, template, status, next_attempt_at, locked_at)
       values
         ('ready@disposable.test', 'Ready Now', 'test', 'pending', now() - interval '1 minute', null),
         ('future@disposable.test', 'Future Backoff', 'test', 'pending', now() + interval '30 minutes', null),
         ('stale@disposable.test', 'Stale Worker Lock', 'test', 'processing', now() - interval '10 minutes', now() - interval '10 minutes')
       returning id, subject`
    );
    expect(inserted.rows).toHaveLength(3);

    // First claim grabs Ready Now + Stale Worker Lock, transitioning both to status='processing' with fresh locked_at
    const claim1 = await pg.queryAs<{ id: string; subject: string; status: string }>(
      { pgRole: 'service_role' },
      `select id, subject, status from public.claim_pending_email_outbox(10, 300)`
    );
    expect(claim1.rows.map((r) => r.subject).sort()).toEqual(['Ready Now', 'Stale Worker Lock']);
    expect(claim1.rows.every((r) => r.status === 'processing')).toBe(true);

    // Immediate second claim returns 0 rows (both already processing with fresh lock, and Future Backoff is not due)
    const claim2 = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `select id from public.claim_pending_email_outbox(10, 300)`
    );
    expect(claim2.rows).toHaveLength(0);
  });

  it('enforces replay-resistant unique r2_key and 500 MB active per-client vault storage quota', async () => {
    const key1 = `private/${client.id}/payment_proof/chunk-1.pdf`;
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.vault_files (
         bucket, r2_key, category, owner_client_id, uploaded_by, filename, mime_type, size_bytes
       ) values ('private', $1, 'payment_proof', $2, $2, 'chunk-1.pdf', 'application/pdf', 300000000)`,
      [key1, client.id]
    );

    // Duplicate replay of same r2_key fails
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.vault_files (
           bucket, r2_key, category, owner_client_id, uploaded_by, filename, mime_type, size_bytes
         ) values ('private', $1, 'payment_proof', $2, $2, 'chunk-1.pdf', 'application/pdf', 1024)`,
        [key1, client.id]
      )
    ).rejects.toThrow(/duplicate|unique/i);

    // Exceeding 500 MB (524,288,000 bytes) active quota fails
    const key2 = `private/${client.id}/payment_proof/chunk-2.pdf`;
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.vault_files (
           bucket, r2_key, category, owner_client_id, uploaded_by, filename, mime_type, size_bytes
         ) values ('private', $1, 'payment_proof', $2, $2, 'chunk-2.pdf', 'application/pdf', 250000000)`,
        [key2, client.id]
      )
    ).rejects.toThrow(/quota/i);
  });
});
