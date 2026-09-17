# Invoice quantity validation repair

The prior shared validator and new-invoice builder tested `Number.isInteger(qty * 1000)`. Binary floating-point multiplication incorrectly rejects valid quantities such as 1.001. In a deterministic sweep of 0.001 through 10.000, 175 valid numeric quantities were rejected, although the existing BigInt rounding implementation calculated all 10000 correctly.

This patch validates finite positive quantities bounded by 1000000 using decimal syntax with at most three fractional digits. It does not round extra precision into acceptance. The builder and shared totals/display validators use the same rule; bounds on cents, aggregate overflow and BigInt per-line rounding remain intact. The builder also refuses empty unit-price text before its Save-and-send handler can turn that into numeric zero.

`node --experimental-strip-types --test tests/invoice-quantity.test.mjs` on Node 22.23.1 tests 10000 values as both strings and numbers, invalid precision/syntax/bounds, rounding and aggregate overflow. The builder wiring assertion is source-level, not a browser interaction test. The dedicated Actions workflow also runs npm ci, lint, types and build without production secrets.

No database migration, existing invoice update, send/payment mutation, role change or production deployment is included. UI layout is preserved. This is one repair within the approved high/medium batch, not completion of the financial/security audit. Browser/database end-to-end invoice creation remains separate acceptance work.
