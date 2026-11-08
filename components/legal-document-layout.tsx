'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface LegalSectionItem {
  id: string;
  number: number;
  title: string;
  content: React.ReactNode;
}

export function LegalDocumentLayout({
  subtitleLeft,
  subtitleRight,
  sections,
  footerSlot,
}: {
  subtitleLeft: React.ReactNode;
  subtitleRight: React.ReactNode;
  sections: LegalSectionItem[];
  footerSlot?: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    const handleScroll = () => {
      const offset = 160;
      let current = sections[0]?.id ?? '';
      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= offset) {
            current = sec.id;
          }
        }
      }
      setActiveId(current);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [sections]);

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-4 text-xs text-muted-foreground">
          <div>{subtitleLeft}</div>
          <div className="font-mono">{subtitleRight}</div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          {/* Sticky CONTENTS Navigation Sidebar (stays visible throughout scroll) */}
          <aside
            aria-label="Document table of contents"
            className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start xl:col-span-3"
          >
            <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-2xs backdrop-blur-xs sm:p-5">
              <div className="mb-3 px-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Contents
              </div>
              <nav className="space-y-1">
                {sections.map((sec) => {
                  const isActive = activeId === sec.id;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      onClick={() => setActiveId(sec.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-xs transition-colors sm:text-sm',
                        isActive
                          ? 'bg-primary/12 font-semibold text-primary'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold',
                          isActive
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-border bg-background text-muted-foreground'
                        )}
                      >
                        {sec.number}
                      </span>
                      <span className="truncate">{sec.title}</span>
                    </a>
                  );
                })}
              </nav>
              {footerSlot && (
                <div className="mt-4 border-t border-border/70 pt-4">
                  {footerSlot}
                </div>
              )}
            </div>
          </aside>

          {/* Numbered Legal Document Sections */}
          <div className="space-y-10 lg:col-span-8 xl:col-span-9">
            {sections.map((sec) => (
              <section
                key={sec.id}
                id={sec.id}
                className="scroll-mt-28 rounded-2xl border border-border/80 bg-card/75 p-6 shadow-2xs sm:p-8"
              >
                <div className="mb-4 flex items-center gap-3 border-b border-border/60 pb-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/12 font-mono text-xs font-bold text-primary">
                    {sec.number}
                  </span>
                  <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {sec.title}
                  </h2>
                </div>
                <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  {sec.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
