export interface InvoiceTotalsInput {
  subtotalCents: number;
  discountCents?: number;
  taxRateBps?: number;
}

export interface InvoiceTotalsResult {
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer in minor units (cents).`);
  }
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  const subtotalCents = input.subtotalCents;
  const discountCents = input.discountCents ?? 0;
  const taxRateBps = input.taxRateBps ?? 0;

  assertNonNegativeInt(subtotalCents, 'subtotalCents');
  assertNonNegativeInt(discountCents, 'discountCents');
  assertNonNegativeInt(taxRateBps, 'taxRateBps');

  if (discountCents > subtotalCents) {
    throw new Error('Discount cannot exceed subtotal.');
  }
  if (taxRateBps > 10_000) {
    throw new Error('Tax rate basis points must be between 0 and 10000.');
  }

  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round((taxableCents * taxRateBps) / 10_000);
  const totalCents = taxableCents + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxableCents,
    taxRateBps,
    taxCents,
    totalCents,
  };
}

export function computeDepositSplit(
  totalCents: number,
  depositPercent: number
): { depositCents: number; balanceCents: number } {
  assertNonNegativeInt(totalCents, 'totalCents');
  if (!Number.isSafeInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    throw new Error('depositPercent must be an integer between 0 and 100.');
  }
  const depositCents = Math.round((totalCents * depositPercent) / 100);
  const balanceCents = totalCents - depositCents;
  return { depositCents, balanceCents };
}

export type PaymentValidationDecision =
  | { ok: true; remainingAfterPaymentCents: number }
  | {
      ok: false;
      reason: 'invalid_amount' | 'currency_mismatch' | 'overpayment';
    };

export function validatePaymentSubmission(input: {
  invoiceTotalCents: number;
  amountPaidCents: number;
  creditedCents: number;
  invoiceCurrency: string;
  paymentAmountCents: number;
  paymentCurrency: string;
}): PaymentValidationDecision {
  if (!Number.isSafeInteger(input.paymentAmountCents) || input.paymentAmountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }
  const invCurr = input.invoiceCurrency.trim().toUpperCase();
  const payCurr = input.paymentCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(invCurr) || invCurr !== payCurr) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  const remaining = Math.max(
    0,
    input.invoiceTotalCents - input.amountPaidCents - input.creditedCents
  );
  if (input.paymentAmountCents > remaining) {
    return { ok: false, reason: 'overpayment' };
  }
  return {
    ok: true,
    remainingAfterPaymentCents: remaining - input.paymentAmountCents,
  };
}

export function computeCappedLtvDeltaUsdCents(input: {
  remainingBeforePaymentCents: number;
  paymentAmountCents: number;
  fxRateToUsd: number;
}): number {
  const effectiveNativeCents = Math.min(
    Math.max(0, Math.trunc(input.remainingBeforePaymentCents)),
    Math.max(0, Math.trunc(input.paymentAmountCents))
  );
  const fx = Number.isFinite(input.fxRateToUsd) && input.fxRateToUsd > 0 ? input.fxRateToUsd : 1;
  return Math.round(effectiveNativeCents * fx);
}
