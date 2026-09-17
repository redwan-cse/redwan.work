# Invoice send disclosure and partial success

Both invoice send dialogs now explain that sending locks financial fields, exposes the invoice to the client and queues a notification whose delivery is tracked separately. They no longer say no email will be sent. Save-and-send runs native validity checks before creating the invoice.

If draft creation succeeds but sending fails, the builder retains the invoice ID, offers a link to that saved invoice and prevents another creation from the same form. An ambiguous network result before the ID is returned asks the operator to inspect the invoice list before retrying; this UI guard is not falsely described as server-side invoice-creation idempotency. The existing three-decimal quantity validator, totals, editing/payment controls and print behavior remain.

The one-project creation page preselects its project. Real product browser acceptance still verifies quantity 1.001 and milestone draft creation. Further payment/print journeys remain part of final review, not assumed from changed copy.
