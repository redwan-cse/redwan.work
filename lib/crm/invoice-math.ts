export const MAX_INVOICE_TOTAL_CENTS = Number.MAX_SAFE_INTEGER;
export const MAX_INVOICE_QTY = 1_000_000;
export const MAX_INVOICE_UNIT_PRICE_CENTS = 1_000_000_000;

/** PostgreSQL round(numeric) for the positive, three-decimal quantities we accept. */
export function roundInvoiceLineCents(qty: number | string, unitPriceCents: number): number {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(String(qty).trim());
  if (!match || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error('Invoice amount exceeds the supported limit.');
  }

  const quantityThousandths = BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? '').padEnd(3, '0') || '0');
  const rounded = (quantityThousandths * BigInt(unitPriceCents) + BigInt(500)) / BigInt(1000);
  if (rounded > BigInt(MAX_INVOICE_TOTAL_CENTS)) throw new Error('Invoice amount exceeds the supported limit.');
  return Number(rounded);
}

export function isSafeInvoiceLine(qty: number, unitPriceCents: number): boolean {
  return Number.isFinite(qty) && qty > 0 && qty <= MAX_INVOICE_QTY && Number.isInteger(qty * 1000) && Number.isInteger(unitPriceCents) && unitPriceCents >= 0 && unitPriceCents <= MAX_INVOICE_UNIT_PRICE_CENTS && Number.isSafeInteger(roundInvoiceLineCents(qty, unitPriceCents));
}

export function calculateInvoiceTotalCents(items: Array<{ qty: number | string; unit_price_cents: number }>): number {
  return items.reduce((total, item) => {
    const qty = Number(item.qty);
    if (!isSafeInvoiceLine(qty, item.unit_price_cents)) throw new Error('Invoice total exceeds the supported limit.');
    const line = roundInvoiceLineCents(item.qty, item.unit_price_cents);
    if (total > MAX_INVOICE_TOTAL_CENTS - line) throw new Error('Invoice total exceeds the supported limit.');
    return total + line;
  }, 0);
}
