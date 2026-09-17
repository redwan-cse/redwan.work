import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isSafeInvoiceQuantity, isSafeInvoiceLine, roundInvoiceLineCents, calculateInvoiceTotalCents, displayInvoiceLineCents, displayInvoiceTotalCents } from '../lib/crm/invoice-math.ts';

test('all 10000 three-decimal quantities validate and round exactly as strings and numbers', () => {
  for (let n = 1; n <= 10000; n++) {
    const text = (n / 1000).toFixed(3);
    const expected = Number((BigInt(n) * 12345n + 500n) / 1000n);
    for (const qty of [text, Number(text)]) {
      assert.equal(isSafeInvoiceQuantity(qty), true, `Rejected valid quantity ${text}`);
      assert.equal(isSafeInvoiceLine(qty, 12345), true);
      assert.equal(roundInvoiceLineCents(qty, 12345), expected);
      assert.equal(calculateInvoiceTotalCents([{ qty, unit_price_cents: 12345 }]), expected);
      assert.equal(displayInvoiceLineCents(qty, 12345), expected);
    }
  }
});

test('invalid precision, syntax and bounds are not rounded into acceptance', () => {
  for (const qty of ['', ' ', '0', 0, -1, '-1', NaN, Infinity, 'Infinity', '1.0001', 1.0001, '1e0', '0x1', '1.', '.5', null, undefined, {}, 1000000.001]) {
    assert.equal(isSafeInvoiceQuantity(qty), false);
    assert.equal(isSafeInvoiceLine(qty, 100), false);
    assert.equal(displayInvoiceLineCents(qty, 100), null);
  }
  for (const qty of ['0.001', '1.001', '1.003', ' 1.005 ', '001.010', 1000000, '1000000.000']) {
    assert.equal(isSafeInvoiceLine(qty, 100), true);
  }
  for (const price of [-1, 0.5, NaN, Infinity, 1000000001]) assert.equal(isSafeInvoiceLine(1, price), false);
  assert.equal(isSafeInvoiceLine(1, 0), true);
});

test('line rounding and total overflow rules remain intact', () => {
  assert.equal(roundInvoiceLineCents('0.500', 1), 1);
  assert.equal(roundInvoiceLineCents('0.499', 1), 0);
  assert.equal(calculateInvoiceTotalCents([{ qty: 2, unit_price_cents: 1250 }, { qty: '0.500', unit_price_cents: 101 }]), 2551);
  const excessive = Array.from({ length: 10 }, () => ({ qty: 1000000, unit_price_cents: 1000000000 }));
  assert.throws(() => calculateInvoiceTotalCents(excessive));
  assert.equal(displayInvoiceTotalCents(excessive), null);
  assert.equal(calculateInvoiceTotalCents([]), 0);
});

test('builder uses shared validation rather than the old floating-point gate', () => {
  const source = readFileSync(new URL('../components/admin/invoice-forms.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('isSafeInvoiceLine(item.qty, cents(item.unit_price))'));
  assert.equal(source.includes('Number.isInteger(Number(item.qty) * 1000)'), false);
});
