'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addInvoiceItemAction, confirmPaymentAction, createDraftInvoiceWithItemsAction, deleteInvoiceItemAction, rejectPaymentAction, sendInvoiceAction, updateDraftInvoiceAction, updateInvoiceItemAction, voidInvoiceAction } from '@/lib/crm/admin-actions';
import type { InvoiceItemRow, PaymentRow } from '@/lib/crm/invoices';

export function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

export function PrintInvoiceButton() {
  return <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="mr-1.5 size-3.5" />Print</Button>;
}

function cents(value: string) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) : -1; }

export function NewInvoiceForm({ projects }: { projects: Array<{ id: string; name: string; client_name: string | null; client_email: string }> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState([{ description: '', qty: '1', unit_price: '' }]);
  const [currency, setCurrency] = useState('USD');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [sendOpen, setSendOpen] = useState(false);

  function submit(formData: FormData, shouldSend: boolean) {
    setError(null);
    if (items.some((item) => !item.description.trim() || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 || !Number.isFinite(Number(item.unit_price)) || cents(item.unit_price) < 0)) {
      setError('Complete every line item with a positive quantity and a valid price.');
      return;
    }
    startTransition(async () => {
      const result = await createDraftInvoiceWithItemsAction({ project_id: String(formData.get('project_id')), currency: String(formData.get('currency') || 'USD'), due_at: String(formData.get('due_at') || '') || null, payment_note: String(formData.get('payment_note') || '') || null, items: items.map((item, position) => ({ description: item.description.trim(), qty: Number(item.qty), unit_price_cents: cents(item.unit_price), position })) });
      if (result.error || !result.invoiceId) { setError(result.error ?? 'Draft could not be created.'); return; }
      if (shouldSend) {
        const sendResult = await sendInvoiceAction(result.invoiceId);
        if (sendResult.error) { setError(sendResult.error); return; }
      }
      router.push(`/admin/invoices/${result.invoiceId}`);
    });
  }
  return <form ref={formRef} action={(formData) => submit(formData, false)} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="invoice-project">Project</Label><select id="invoice-project" name="project_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select an active project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.client_name ?? p.client_email}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="invoice-currency">Currency</Label><Input id="invoice-currency" name="currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required /></div>
      <div className="space-y-1.5"><Label htmlFor="invoice-due">Due date</Label><Input id="invoice-due" name="due_at" type="date" /></div>
    </div>
    <div className="space-y-1.5"><Label htmlFor="invoice-note">Payment note</Label><Textarea id="invoice-note" name="payment_note" rows={3} placeholder="Optional payment instructions" /></div>
    <fieldset className="space-y-3"><legend className="text-sm font-medium">Line items</legend>{items.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_100px_130px_100px_auto]"><div className="space-y-1"><Label htmlFor={`new-description-${index}`}>Description</Label><Input id={`new-description-${index}`} value={item.description} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} required maxLength={500} /></div><div className="space-y-1"><Label htmlFor={`new-qty-${index}`}>Qty</Label><Input id={`new-qty-${index}`} value={item.qty} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, qty: event.target.value } : row))} type="number" step="0.001" min="0.001" required /></div><div className="space-y-1"><Label htmlFor={`new-price-${index}`}>Unit price</Label><Input id={`new-price-${index}`} value={item.unit_price} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, unit_price: event.target.value } : row))} type="number" step="0.01" min="0" required /></div><div className="flex items-end text-sm text-muted-foreground">{money(Math.round(Number(item.qty || 0) * cents(item.unit_price)), currency)}</div><div className="flex items-end"><Button type="button" size="sm" variant="ghost" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))} disabled={items.length === 1}>Remove</Button></div></div>)}<p className="text-right text-sm font-semibold">Total: {money(items.reduce((sum, item) => sum + Math.round(Number(item.qty) * cents(item.unit_price)), 0), currency)}</p><Button type="button" size="sm" variant="outline" onClick={() => setItems((current) => [...current, { description: '', qty: '1', unit_price: '' }])}>Add line item</Button></fieldset>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft'}</Button><Dialog open={sendOpen} onOpenChange={setSendOpen}><DialogTrigger asChild><Button type="button" variant="outline" disabled={pending}>Save and send</Button></DialogTrigger><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Send invoice</DialogTitle><DialogDescription>Sending locks the invoice financial fields. No email will be sent.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="ghost" size="sm" onClick={() => setSendOpen(false)}>Cancel</Button><Button type="button" size="sm" disabled={pending} onClick={() => { setSendOpen(false); if (formRef.current) submit(new FormData(formRef.current), true); }}>{pending ? 'Sending…' : 'Confirm send'}</Button></DialogFooter></DialogContent></Dialog></div>
  </form>;
}

export function DraftInvoiceForm({ invoice, items, projects }: { invoice: { id: string; project_id: string; currency: string; due_at: string | null; payment_note: string | null }; items: InvoiceItemRow[]; projects: Array<{ id: string; name: string; client_name: string | null; client_email: string }> }) {
  const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();
  function save(formData: FormData) { setError(null); startTransition(async () => { const result = await updateDraftInvoiceAction(invoice.id, { project_id: String(formData.get('project_id')), currency: String(formData.get('currency')), due_at: String(formData.get('due_at') || '') || null, payment_note: String(formData.get('payment_note') || '') || null }); if (result.error) setError(result.error); else router.refresh(); }); }
  return <form action={save} className="space-y-3 print:hidden"><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="draft-project">Project</Label><select id="draft-project" name="project_id" defaultValue={invoice.project_id} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.client_name ?? project.client_email}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="draft-currency">Currency</Label><Input id="draft-currency" name="currency" defaultValue={invoice.currency} maxLength={3} required /></div><div className="space-y-1.5"><Label htmlFor="draft-due">Due date</Label><Input id="draft-due" name="due_at" type="date" defaultValue={invoice.due_at ?? ''} /></div></div><div className="space-y-1.5"><Label htmlFor="draft-note">Payment note</Label><Textarea id="draft-note" name="payment_note" defaultValue={invoice.payment_note ?? ''} rows={2} /></div>{error && <p className="text-sm text-destructive">{error}</p>}<Button size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button></form>;
}

export function LineItemForm({ invoiceId, item, position = 0 }: { invoiceId: string; item?: InvoiceItemRow; position?: number }) {
  const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();
  function save(formData: FormData) { setError(null); startTransition(async () => { const data = { description: String(formData.get('description')), qty: Number(formData.get('qty')), unit_price_cents: cents(String(formData.get('unit_price'))), position }; const result = item ? await updateInvoiceItemAction(item.id, data) : await addInvoiceItemAction(invoiceId, data); if (result.error) setError(result.error); else router.refresh(); }); }
  return <form action={save} className="grid gap-2 sm:grid-cols-[1fr_100px_130px_auto] sm:items-end"><div className="space-y-1"><Label htmlFor={`description-${item?.id ?? position}`}>Description</Label><Input id={`description-${item?.id ?? position}`} name="description" defaultValue={item?.description} required maxLength={500} /></div><div className="space-y-1"><Label htmlFor={`qty-${item?.id ?? position}`}>Qty</Label><Input id={`qty-${item?.id ?? position}`} name="qty" type="number" step="0.001" min="0.001" defaultValue={item?.qty ?? 1} required /></div><div className="space-y-1"><Label htmlFor={`price-${item?.id ?? position}`}>Unit price</Label><Input id={`price-${item?.id ?? position}`} name="unit_price" type="number" step="0.01" min="0" defaultValue={item ? (item.unit_price_cents / 100).toFixed(2) : ''} required /></div><Button size="sm" disabled={pending}>{pending ? 'Saving…' : item ? 'Update' : 'Add item'}</Button>{error && <p className="text-xs text-destructive sm:col-span-full">{error}</p>}</form>;
}

export function DeleteItemButton({ itemId }: { itemId: string }) { const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter(); return <span className="inline-flex items-center gap-2">{error && <span className="text-xs text-destructive">{error}</span>}<Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { const result = await deleteInvoiceItemAction(itemId); if (result.error) setError(result.error); else router.refresh(); })}>{pending ? 'Removing…' : 'Remove'}</Button></span>; }

export function InvoiceLifecycleControls({ invoiceId, number, status }: { invoiceId: string; number: number; status: string }) {
  const [open, setOpen] = useState(false); const [typed, setTyped] = useState(''); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter();
  function run(action: () => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await action(); if (result.error) setError(result.error); else { setOpen(false); setTyped(''); router.refresh(); } }); }
  return <div className="flex flex-wrap gap-2 print:hidden">{status === 'draft' && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm">Send invoice</Button></DialogTrigger><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Send invoice</DialogTitle><DialogDescription>Sending locks the invoice financial fields. No email will be sent.</DialogDescription></DialogHeader>{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" disabled={pending} onClick={() => run(() => sendInvoiceAction(invoiceId))}>{pending ? 'Sending…' : 'Confirm send'}</Button></DialogFooter></DialogContent></Dialog>}{status === 'sent' && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="destructive">Void invoice</Button></DialogTrigger><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Void invoice</DialogTitle><DialogDescription>Type INV-{number} to confirm. This preserves the invoice for audit.</DialogDescription></DialogHeader><Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`INV-${number}`} autoComplete="off" />{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" variant="destructive" disabled={pending || typed !== `INV-${number}`} onClick={() => run(() => voidInvoiceAction(invoiceId))}>{pending ? 'Voiding…' : 'Confirm void'}</Button></DialogFooter></DialogContent></Dialog>}</div>;
}

export function PaymentDecisionButtons({ payment }: { payment: PaymentRow }) { const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition(); const router = useRouter(); function decide(action: (id: string) => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await action(payment.id); if (result.error) setError(result.error); else router.refresh(); }); } return payment.status === 'submitted' ? <span className="inline-flex flex-wrap items-center gap-2 print:hidden"><Button size="sm" disabled={pending} onClick={() => decide(confirmPaymentAction)}>Confirm</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => decide(rejectPaymentAction)}>Reject</Button>{error && <span className="text-xs text-destructive">{error}</span>}</span> : <span className="text-xs text-muted-foreground">{payment.status}</span>; }
