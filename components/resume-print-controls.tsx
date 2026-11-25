'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PrintableResumeProps } from '@/components/printable-resume';

const PRINT_RESUME_EVENT = 'redwan:print-resume';

const LazyResumePrintRunner = dynamic(
  () => import('@/components/resume-print-runner').then((m) => m.ResumePrintRunner),
  { ssr: false }
);

export function ResumePrintButton({
  label,
  size = 'default',
  className,
  iconClassName = 'h-4 w-4',
}: {
  label: string;
  size?: 'default' | 'lg' | 'sm';
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => {
        window.dispatchEvent(new Event(PRINT_RESUME_EVENT));
      }}
      className={className}
    >
      <Printer className={iconClassName} />
      {label}
    </Button>
  );
}

export function ResumePrintHost({ data }: { data: PrintableResumeProps }) {
  const [printRunId, setPrintRunId] = useState(0);

  useEffect(() => {
    const onTrigger = () => {
      setPrintRunId((prev) => prev + 1);
    };
    window.addEventListener(PRINT_RESUME_EVENT, onTrigger);
    return () => window.removeEventListener(PRINT_RESUME_EVENT, onTrigger);
  }, []);

  if (printRunId === 0) {
    return null;
  }

  return (
    <LazyResumePrintRunner
      key={printRunId}
      data={data}
      onComplete={() => setPrintRunId(0)}
    />
  );
}
