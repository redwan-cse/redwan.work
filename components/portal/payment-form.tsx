'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitPaymentAction } from '@/lib/crm/client-actions';

type PaymentMethod = 'bank' | 'bkash' | 'paypal' | 'other';

export function PrintInvoiceButton() {
  return <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">Print</Button>;
}

export function PaymentForm({ invoiceId, outstandingCents, currency }: { invoiceId: string; outstandingCents: number; currency: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setNotice(null);
    const method = String(formData.get('method')) as PaymentMethod;
    const reference = String(formData.get('reference') ?? '').trim();
    const amount = Number(formData.get('amount'));
    const amountCents = Math.round(amount * 100);
    if (!['bank', 'bkash', 'paypal', 'other'].includes(method) || !reference || !Number.isFinite(amount) || amountCents <= 0 || amountCents > outstandingCents) {
      setError(`Enter a valid payment method, reference, and amount up to ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(outstandingCents / 100)}.`);
      return;
    }
    startTransition(async () => {
      const result = await submitPaymentAction(invoiceId, { method, reference, amount_cents: amountCents });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.notice ?? 'Payment submitted for review.');
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={submit} className="space-y-3 print:hidden">
      <h2 className="text-lg font-semibold">Submit a payment</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="payment-method">Method</Label><select id="payment-method" name="method" required defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="" disabled>Select a method</option><option value="bank">Bank transfer</option><option value="bkash">bKash</option><option value="paypal">PayPal</option><option value="other">Other</option></select></div>
        <div className="space-y-1.5"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" max={(outstandingCents / 100).toFixed(2)} required /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="payment-reference">Transaction/reference ID</Label><Input id="payment-reference" name="reference" maxLength={200} required /></div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-600" role="status">{notice}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit payment'}</Button>
    </form>
  );
}
