'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintInvoiceButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="gap-1.5 print:hidden"
    >
      <Printer className="h-3.5 w-3.5" />
      Print / Save PDF
    </Button>
  );
}
