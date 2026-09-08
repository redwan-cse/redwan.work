export function parseMilestoneMoney(cents: string, amount: string): { ok: true; amount_cents?: number } | { ok: false } {
  if (typeof cents !== 'string' || typeof amount !== 'string') return { ok: false };
  cents = cents.trim(); amount = amount.trim();
  if (cents && amount) return { ok: false };
  if (!cents && !amount) return { ok: true };
  if (cents ? !/^[0-9]{1,10}$/.test(cents) : !/^[0-9]{1,8}(?:\.[0-9]{1,2})?$/.test(amount)) return { ok: false };
  const parts = amount.split('.');
  const value = cents ? BigInt(cents) : BigInt(parts[0]) * 100n + BigInt((parts[1] ?? '').padEnd(2, '0'));
  return value <= 2147483647n ? { ok: true, amount_cents: Number(value) } : { ok: false };
}
