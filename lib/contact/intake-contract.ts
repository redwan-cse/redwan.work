// Shared pure validation only: safe to import from the browser and the server.
export const MAX_BUDGET_USD = 10_000_000;
export const BUDGET_ERROR = 'Leave both budgets blank, or enter whole-dollar USD amounts from 0 to 10,000,000 with minimum no greater than maximum.';
export const NDA_ERROR = 'Invalid confidentiality selection. Please reload the form and select your preference again.';

export function parseBudgetRange(minimum: string, maximum: string):
  | { ok: true; minimum: number | null; maximum: number | null }
  | { ok: false; error: string } {
  const min = minimum.trim();
  const max = maximum.trim();
  if (min === '' && max === '') return { ok: true, minimum: null, maximum: null };
  if (!/^[0-9]+$/.test(min) || !/^[0-9]+$/.test(max)) return { ok: false, error: BUDGET_ERROR };
  const low = Number(min);
  const high = Number(max);
  if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low < 0 || high > MAX_BUDGET_USD || low > high) {
    return { ok: false, error: BUDGET_ERROR };
  }
  return { ok: true, minimum: low, maximum: high };
}

export function parseNdaValues(values: FormDataEntryValue[]):
  | { ok: true; required: boolean }
  | { ok: false; error: string } {
  if (values.length === 0) return { ok: true, required: false };
  if (values.length !== 1 || typeof values[0] !== 'string') return { ok: false, error: NDA_ERROR };
  // Exact legacy value supports already-open forms. No case folding or truthiness.
  if (values[0] === 'true' || values[0] === 'Yes - NDA or strict confidentiality required') return { ok: true, required: true };
  if (values[0] === 'false' || values[0] === '') return { ok: true, required: false };
  return { ok: false, error: NDA_ERROR };
}
