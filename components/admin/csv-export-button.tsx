'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function CsvExportButton({
  filename,
  headers,
  rows,
  label = 'Export CSV',
}: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  label?: string;
}) {
  const handleExport = () => {
    const csvLines = [
      headers.map(sanitizeCsvCell).join(','),
      ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
    ];
    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="h-8 gap-1.5 rounded-full text-xs"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}
