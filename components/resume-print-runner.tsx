'use client';

import { useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { PrintableResume, type PrintableResumeProps } from '@/components/printable-resume';

export function ResumePrintRunner({
  data,
  onComplete,
}: {
  data: PrintableResumeProps;
  onComplete: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${data.personalInfo.name.replace(/\s+/g, '_')}_Resume`,
    onAfterPrint: onComplete,
    pageStyle: `
      @page {
        size: A4;
        margin: 0;
      }
      @media print {
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        html, body {
          height: 100%;
          overflow: visible;
        }
        @page { size: A4; margin: 0; }
      }
    `,
  });

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      handlePrint();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handlePrint]);

  return (
    <div className="hidden" aria-hidden="true">
      <PrintableResume ref={printRef} {...data} />
    </div>
  );
}
