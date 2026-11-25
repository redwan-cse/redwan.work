'use client';

import * as React from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createMultiLineInvoiceAction } from '@/lib/crm/actions';

interface LineItemDraft {
  description: string;
  quantity: number;
  unitPriceMajor: string;
}

export function MultiLineInvoiceComposer({
  clients,
  orders,
  defaultClientId = '',
  defaultOrderId = '',
}: {
  clients: Array<{ id: string; full_name: string | null; email: string }>;
  orders: Array<{ id: string; code: string; title: string; client_id: string }>;
  defaultClientId?: string;
  defaultOrderId?: string;
}) {
  const [selectedClientId, setSelectedClientId] = React.useState(defaultClientId);
  const [currency, setCurrency] = React.useState('USD');
  const [fxRate, setFxRate] = React.useState('1.0');
  const [discountMajor, setDiscountMajor] = React.useState('0');
  const [taxRatePct, setTaxRatePct] = React.useState('0');
  const [items, setItems] = React.useState<LineItemDraft[]>([
    { description: 'Security Assessment & Engineering Scope', quantity: 1, unitPriceMajor: '500' },
  ]);

  const clientOrders = React.useMemo(
    () =>
      selectedClientId
        ? orders.filter((o) => o.client_id === selectedClientId)
        : orders,
    [orders, selectedClientId]
  );

  const subtotalMajor = items.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const unit = Math.max(0, Number(item.unitPriceMajor || 0));
    return sum + qty * unit;
  }, 0);

  const discountVal = Math.max(0, Number(discountMajor || 0));
  const taxable = Math.max(0, subtotalMajor - discountVal);
  const taxBps = Math.max(0, Math.round(Number(taxRatePct || 0) * 100));
  const taxVal = Math.round(taxable * (taxBps / 100)) / 100;
  const totalVal = taxable + taxVal;

  const itemsJson = JSON.stringify(
    items
      .map((row) => ({
        description: row.description.trim(),
        quantity: Math.max(1, Math.round(Number(row.quantity || 1))),
        unit_price_major: Math.max(0, Number(row.unitPriceMajor || 0)),
      }))
      .filter((row) => row.description && row.unit_price_major > 0)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Multi-Line Draft &amp; Issued Invoice Composer</CardTitle>
        <CardDescription className="text-xs">
          Build itemized invoices in USD, EUR, GBP, or BDT with live tax/discount preview. Save as Draft to review before dispatching to client, or Issue Immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionFeedbackForm
          action={createMultiLineInvoiceAction}
          successMessage="Invoice saved."
          className="space-y-5"
        >
          <input type="hidden" name="items_json" value={itemsJson} />
          <input type="hidden" name="tax_rate_bps" value={String(taxBps)} />
          <input type="hidden" name="redirect_to_invoice" value="1" />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="ml-inv-client" className="text-xs">Client *</Label>
              <select
                id="ml-inv-client"
                name="client_id"
                aria-label="Invoice client"
                required
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
              >
                <option value="">— Select Client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.email} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ml-inv-order" className="text-xs">Linked Order (Optional)</Label>
              <select
                id="ml-inv-order"
                name="order_id"
                aria-label="Linked order"
                defaultValue={defaultOrderId}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
              >
                <option value="">— Standalone Invoice —</option>
                {clientOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}: {o.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ml-inv-currency" className="text-xs">Currency</Label>
              <select
                id="ml-inv-currency"
                name="currency"
                aria-label="Invoice currency"
                value={currency}
                onChange={(e) => {
                  const next = e.target.value;
                  setCurrency(next);
                  if (next === 'USD') setFxRate('1.0');
                  if (next === 'BDT') setFxRate('0.0083');
                  if (next === 'EUR') setFxRate('1.08');
                  if (next === 'GBP') setFxRate('1.27');
                }}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
              >
                <option value="USD">USD</option>
                <option value="BDT">BDT</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="ml-inv-fx" className="text-xs">FX → USD</Label>
                <Input
                  id="ml-inv-fx"
                  name="fx_rate_to_usd"
                  type="number"
                  step="0.0001"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ml-inv-due" className="text-xs">Due Days</Label>
                <Input
                  id="ml-inv-due"
                  name="due_days"
                  type="number"
                  min="1"
                  defaultValue="7"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2.5 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Line Items
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { description: '', quantity: 1, unitPriceMajor: '100' },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Line
              </Button>
            </div>

            {items.map((row, index) => (
              <div key={index} className="grid grid-cols-12 items-center gap-2">
                <Input
                  aria-label={`Line item ${index + 1} description`}
                  value={row.description}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, description: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Line item description..."
                  required
                  className="col-span-12 h-9 sm:col-span-6 text-xs"
                />
                <Input
                  aria-label={`Line item ${index + 1} quantity`}
                  type="number"
                  min="1"
                  value={row.quantity}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((item, i) =>
                        i === index
                          ? { ...item, quantity: Math.max(1, Number(e.target.value || 1)) }
                          : item
                      )
                    )
                  }
                  placeholder="Qty"
                  className="col-span-4 h-9 sm:col-span-2 font-mono text-xs"
                />
                <Input
                  aria-label={`Line item ${index + 1} unit price`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={row.unitPriceMajor}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, unitPriceMajor: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Unit Price"
                  className="col-span-6 h-9 sm:col-span-3 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={items.length <= 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-2 h-9 w-9 sm:col-span-1 text-destructive"
                  aria-label={`Remove line item ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ml-inv-discount" className="text-xs">Discount ({currency})</Label>
              <Input
                id="ml-inv-discount"
                name="discount_major"
                type="number"
                min="0"
                step="0.01"
                value={discountMajor}
                onChange={(e) => setDiscountMajor(e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ml-inv-tax" className="text-xs">Tax Rate (%)</Label>
              <Input
                id="ml-inv-tax"
                type="number"
                min="0"
                step="0.1"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 font-mono text-xs">
              <div className="text-[10px] text-muted-foreground">Live Invoice Total</div>
              <div className="text-base font-bold text-primary">
                {currency} {totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ml-inv-instructions" className="text-xs">Payment Instructions (Optional)</Label>
              <Textarea
                id="ml-inv-instructions"
                name="payment_instructions"
                rows={2}
                placeholder="SWIFT/IBAN, Wise tag, or bKash/Payoneer memo..."
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ml-inv-notes" className="text-xs">Client Invoice Notes (Optional)</Label>
              <Textarea
                id="ml-inv-notes"
                name="notes"
                rows={2}
                placeholder="Net-7 terms, project reference, or tax memo..."
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="submit"
              name="issue_immediately"
              value="true"
              className="gap-1.5 rounded-full"
            >
              <Send className="h-4 w-4" />
              Issue Invoice to Client Now
            </Button>
            <Button
              type="submit"
              name="issue_immediately"
              value="false"
              variant="outline"
              className="rounded-full"
            >
              Save as Draft First
            </Button>
          </div>
        </ActionFeedbackForm>
      </CardContent>
    </Card>
  );
}
