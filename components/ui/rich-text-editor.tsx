'use client';

import * as React from 'react';
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  PenLine,
  Quote,
  Table,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
  error?: boolean;
  ariaDescribedBy?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
}

function renderFormattedPreview(text: string): React.ReactNode {
  if (!text.trim()) {
    return <p className="text-muted-foreground italic">Nothing to preview yet…</p>;
  }

  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  const formatInline = (line: string): React.ReactNode[] => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={idx} className="italic">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={idx} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table block detection
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const rows = tableLines
        .filter((r) => !/^\|[\s\-:|]+\|$/.test(r))
        .map((r) =>
          r
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        );
      if (rows.length > 0) {
        const [header, ...body] = rows;
        blocks.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-md border border-border/80">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/80 bg-muted/60 font-semibold text-foreground">
                <tr>
                  {header.map((cell, cIdx) => (
                    <th key={cIdx} className="px-3 py-2">
                      {formatInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-muted-foreground">
                        {formatInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Heading 2
    if (line.startsWith('## ')) {
      blocks.push(
        <h4 key={i} className="mt-3 mb-1 text-base font-bold text-foreground">
          {formatInline(line.slice(3))}
        </h4>
      );
      i += 1;
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      blocks.push(
        <h5 key={i} className="mt-2.5 mb-1 text-sm font-semibold text-foreground">
          {formatInline(line.slice(4))}
        </h5>
      );
      i += 1;
      continue;
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={i}
          className="my-1.5 border-l-2 border-primary pl-3 text-sm italic text-muted-foreground"
        >
          {formatInline(line.slice(2))}
        </blockquote>
      );
      i += 1;
      continue;
    }

    if (!line.trim()) {
      blocks.push(<div key={i} className="h-2" />);
    } else {
      blocks.push(
        <p key={i} className="text-sm leading-relaxed text-muted-foreground">
          {formatInline(line)}
        </p>
      );
    }
    i += 1;
  }

  return <div className="space-y-1">{blocks}</div>;
}

export function RichTextEditor({
  id,
  name,
  value,
  onChange,
  placeholder,
  minHeightClassName = 'min-h-[160px]',
  error,
  ariaDescribedBy,
  textareaRef,
  disabled,
}: RichTextEditorProps) {
  const internalRef = React.useRef<HTMLTextAreaElement>(null);
  const resolvedRef = textareaRef ?? internalRef;
  const [mode, setMode] = React.useState<'write' | 'preview'>('write');

  const applyFormat = (
    type:
      | 'bold'
      | 'italic'
      | 'h2'
      | 'h3'
      | 'bullet'
      | 'number'
      | 'table'
      | 'code'
      | 'quote'
  ) => {
    const el = resolvedRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    let insertion = '';
    let cursorOffset = 0;

    switch (type) {
      case 'bold': {
        const inner = selected || 'bold text';
        insertion = `**${inner}**`;
        cursorOffset = insertion.length;
        break;
      }
      case 'italic': {
        const inner = selected || 'italic text';
        insertion = `*${inner}*`;
        cursorOffset = insertion.length;
        break;
      }
      case 'h2': {
        const inner = selected || 'Section Heading';
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}## ${inner}\n`;
        cursorOffset = insertion.length;
        break;
      }
      case 'h3': {
        const inner = selected || 'Subheading';
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}### ${inner}\n`;
        cursorOffset = insertion.length;
        break;
      }
      case 'bullet': {
        const lines = (selected || 'Bullet point item').split('\n');
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}${lines.map((l) => `- ${l}`).join('\n')}\n`;
        cursorOffset = insertion.length;
        break;
      }
      case 'number': {
        const lines = (selected || 'Numbered item').split('\n');
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}${lines.map((l, idx) => `${idx + 1}. ${l}`).join('\n')}\n`;
        cursorOffset = insertion.length;
        break;
      }
      case 'table': {
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}| Target / Module | Scope / Requirement | Priority |\n| --- | --- | --- |\n| Web Application | OWASP Top 10 & API Auth | High |\n| Admin Portal | Role-Based Access Review | Medium |\n`;
        cursorOffset = insertion.length;
        break;
      }
      case 'code': {
        const inner = selected || 'code or technical snippet';
        insertion = `\`${inner}\``;
        cursorOffset = insertion.length;
        break;
      }
      case 'quote': {
        const inner = selected || 'Important note or constraint';
        const prefix = before.endsWith('\n') || before.length === 0 ? '' : '\n';
        insertion = `${prefix}> ${inner}\n`;
        cursorOffset = insertion.length;
        break;
      }
    }

    const nextValue = `${before}${insertion}${after}`;
    onChange(nextValue);
    setMode('write');

    requestAnimationFrame(() => {
      if (resolvedRef.current) {
        resolvedRef.current.focus();
        const pos = start + cursorOffset;
        resolvedRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background transition-colors',
        error ? 'border-destructive focus-within:ring-2 focus-within:ring-destructive' : 'border-input focus-within:ring-2 focus-within:ring-ring'
      )}
    >
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border/70 bg-muted/40 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('bold')}
            className="h-7 w-7 p-0"
            title="Bold"
            aria-label="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('italic')}
            className="h-7 w-7 p-0"
            title="Italic"
            aria-label="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('h2')}
            className="h-7 w-7 p-0"
            title="Heading 2"
            aria-label="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('h3')}
            className="h-7 w-7 p-0"
            title="Heading 3"
            aria-label="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('bullet')}
            className="h-7 w-7 p-0"
            title="Bullet List"
            aria-label="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('number')}
            className="h-7 w-7 p-0"
            title="Numbered List"
            aria-label="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('table')}
            className="h-7 px-2 gap-1 text-xs"
            title="Insert Table"
            aria-label="Insert Table"
          >
            <Table className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Table</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('code')}
            className="h-7 w-7 p-0"
            title="Code Snippet"
            aria-label="Code Snippet"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => applyFormat('quote')}
            className="h-7 w-7 p-0"
            title="Blockquote"
            aria-label="Blockquote"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Write / Preview Toggle */}
        <div className="flex items-center gap-1 rounded-md bg-background/80 p-0.5 border border-border/60">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              mode === 'write'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <PenLine className="h-3 w-3" />
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              mode === 'preview'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Editor / Preview Body */}
      <Textarea
        id={id}
        name={name}
        ref={resolvedRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error}
        aria-describedby={ariaDescribedBy}
        className={cn(
          'rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
          minHeightClassName,
          mode === 'preview' && 'sr-only'
        )}
      />

      {mode === 'preview' && (
        <div className={cn('p-3.5', minHeightClassName)}>
          {renderFormattedPreview(value)}
        </div>
      )}
    </div>
  );
}
