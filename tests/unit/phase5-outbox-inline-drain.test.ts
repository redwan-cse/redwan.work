import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockDrain = vi.fn();
const mockAfter = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: (...args: unknown[]) => mockInsert(...args) }),
  }),
}));

vi.mock('@/lib/email/outbox', () => ({
  drainEmailOutbox: (...args: unknown[]) => mockDrain(...args),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (cb: () => unknown) => mockAfter(cb) };
});

import { enqueueTransactionalEmail } from '@/lib/crm/audit';

const input = {
  toEmail: 'client@example.test',
  template: 'invoice_issued',
  subject: 'Invoice issued',
};

describe('Transactional email enqueue does not depend on the scheduled cron', () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFlag = process.env.EMAIL_OUTBOX_INLINE_DRAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockDrain.mockResolvedValue({ accepted: 1, deferred: 0, failed: 0 });
    process.env.RESEND_API_KEY = 're_test_key_for_unit_tests';
    delete process.env.EMAIL_OUTBOX_INLINE_DRAIN;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFlag === undefined) delete process.env.EMAIL_OUTBOX_INLINE_DRAIN;
    else process.env.EMAIL_OUTBOX_INLINE_DRAIN = savedFlag;
  });

  it('[OUTBOX-INLINE-DRAIN] schedules an immediate best-effort drain after a successful enqueue', async () => {
    await enqueueTransactionalEmail(input);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockAfter).toHaveBeenCalledTimes(1);

    await (mockAfter.mock.calls[0][0] as () => Promise<void>)();
    expect(mockDrain).toHaveBeenCalledWith(10);
  });

  it('[OUTBOX-INLINE-DRAIN] never drains when the insert failed (nothing queued)', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'insert failed' } });
    await enqueueTransactionalEmail(input);
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('[OUTBOX-INLINE-DRAIN] only queues (cron-only) when EMAIL_OUTBOX_INLINE_DRAIN=off', async () => {
    process.env.EMAIL_OUTBOX_INLINE_DRAIN = 'off';
    await enqueueTransactionalEmail(input);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('[OUTBOX-INLINE-DRAIN] swallows a failing drain so the user request never errors', async () => {
    mockDrain.mockRejectedValue(new Error('resend down'));
    await enqueueTransactionalEmail(input);
    await expect(
      (mockAfter.mock.calls[0][0] as () => Promise<void>)()
    ).resolves.toBeUndefined();
  });
});
