export function invoiceRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validInvoiceHeader(value: unknown): boolean {
  if (!invoiceRecord(value)) return false;
  if (value.currency !== undefined && (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency.trim().toUpperCase()))) return false;
  if (value.payment_note !== undefined && value.payment_note !== null && typeof value.payment_note !== 'string') return false;
  if (value.due_at !== undefined && value.due_at !== null && typeof value.due_at !== 'string') return false;
  return true;
}
export function validInvoiceItemShape(value: unknown, partial = false): boolean {
  if (!invoiceRecord(value)) return false;
  if ((!partial || value.description !== undefined) && (typeof value.description !== 'string' || value.description.trim().length < 1 || value.description.trim().length > 500)) return false;
  if ((!partial || value.qty !== undefined) && (typeof value.qty !== 'number' || !Number.isFinite(value.qty))) return false;
  if ((!partial || value.unit_price_cents !== undefined) && (typeof value.unit_price_cents !== 'number' || !Number.isSafeInteger(value.unit_price_cents))) return false;
  if (value.position !== undefined && (typeof value.position !== 'number' || !Number.isInteger(value.position) || value.position < 0 || value.position > 2147483647)) return false;
  return true;
}
