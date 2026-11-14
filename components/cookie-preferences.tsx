'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Database,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const COOKIE_PREFERENCES_STORAGE_KEY = 'redwan_work_cookie_preferences_v1';
export const OPEN_COOKIE_PREFERENCES_EVENT = 'redwan:open-cookie-preferences';
export const COOKIE_PREFERENCES_CHANGED_EVENT = 'redwan:cookie-preferences-changed';

export interface CookieConsentState {
  version: 2;
  essential: true;
  experience: boolean;
  updatedAt: string;
}

interface LegacyConsentShape {
  essential?: unknown;
  experience?: unknown;
  analytics?: unknown;
  marketing?: unknown;
  social?: unknown;
  updatedAt?: unknown;
}

export function openCookiePreferencesModal() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
  }
}

export function readSavedConsentState(): CookieConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyConsentShape;
    if (parsed && parsed.essential === true && typeof parsed.updatedAt === 'string') {
      const experience =
        typeof parsed.experience === 'boolean'
          ? parsed.experience
          : Boolean(parsed.analytics || parsed.social || parsed.marketing);
      return {
        version: 2,
        essential: true,
        experience,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // Ignore storage access or malformed JSON errors
  }
  return null;
}

/**
 * Returns true unless the visitor explicitly opted into Essential Only storage
 * (`experience: false`).
 */
export function allowsExperienceStorage(): boolean {
  const saved = readSavedConsentState();
  return saved ? saved.experience : true;
}

export function CookiePreferencesTrigger({ label = 'Privacy & Cookie Controls' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={openCookiePreferencesModal}
      className="text-muted-foreground transition-colors hover:text-primary hover:underline"
    >
      {label}
    </button>
  );
}

export function CookiePreferences() {
  const [visible, setVisible] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [experienceEnabled, setExperienceEnabled] = React.useState(true);
  const lastTriggerRef = React.useRef<HTMLElement | null>(null);
  const shouldFocusCloseRef = React.useRef(false);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    let timer: number | undefined;
    const saved = readSavedConsentState();
    const isAutomated = typeof navigator !== 'undefined' && navigator.webdriver === true;
    if (!saved && !isAutomated) {
      timer = window.setTimeout(() => {
        const latest = readSavedConsentState();
        setExperienceEnabled(latest ? latest.experience : true);
        setVisible(true);
      }, 450);
    }

    const handleOpen = () => {
      lastTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      shouldFocusCloseRef.current = true;
      const latest = readSavedConsentState();
      setExperienceEnabled(latest ? latest.experience : true);
      setExpanded(true);
      setVisible(true);
    };

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
    };
  }, []);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    shouldFocusCloseRef.current = false;
    const previous = lastTriggerRef.current;
    lastTriggerRef.current = null;
    if (previous && document.contains(previous)) {
      window.requestAnimationFrame(() => previous.focus());
    }
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, dismiss]);

  React.useEffect(() => {
    if (visible && shouldFocusCloseRef.current) {
      shouldFocusCloseRef.current = false;
      closeButtonRef.current?.focus();
    }
  }, [visible]);

  const persistConsent = (nextExperience: boolean) => {
    const payload: CookieConsentState = {
      version: 2,
      essential: true,
      experience: nextExperience,
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(COOKIE_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
      const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
      const consentValue = nextExperience ? 'essential,experience' : 'essential';
      document.cookie = `rw_cookie_consent=${encodeURIComponent(
        consentValue
      )}; Max-Age=15552000; Path=/; SameSite=Lax${secureAttr}`;
      window.dispatchEvent(
        new CustomEvent<CookieConsentState>(COOKIE_PREFERENCES_CHANGED_EVENT, {
          detail: payload,
        })
      );
    } catch {
      // Ignore storage write errors in restricted browsing contexts
    }

    setExperienceEnabled(nextExperience);
    dismiss();
  };

  if (!visible) return null;

  return (
    <section
      aria-labelledby="rw-privacy-notice-title"
      className={cn(
        'print:hidden fixed inset-x-3 bottom-3 z-50 mx-auto w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-primary/25 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-xl transition-all duration-200 sm:inset-x-auto sm:bottom-6 sm:left-6',
        expanded ? 'sm:w-[520px]' : 'sm:w-[420px]'
      )}
    >
      {/* Subtle Antigravity top energy accent */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-primary/15 via-primary to-primary/15"
      />

      <div className="p-4 sm:p-5">
        {/* Header bar */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
              <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
              Zero Ad Trackers · Local Privacy
            </div>
            <h2
              id="rw-privacy-notice-title"
              className="text-sm font-bold tracking-tight text-foreground sm:text-base"
            >
              Privacy &amp; Storage Notice
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={dismiss}
            aria-label="Close privacy and storage notice"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">redwan.work</strong> runs no
          third-party advertising pixels or behavioral analytics. Only essential security/session
          cookies and optional local experience preferences are used. Read our{' '}
          <Link
            href="/privacy#data-collected"
            className="font-medium text-primary underline underline-offset-4 hover:opacity-85"
          >
            Data Notice
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy#cookies"
            className="font-medium text-primary underline underline-offset-4 hover:opacity-85"
          >
            Cookie Policy
          </Link>
          .
        </p>

        {/* Primary Action Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => persistConsent(true)}
            className="h-9 rounded-full px-4 text-xs font-semibold"
          >
            Accept &amp; Continue
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => persistConsent(false)}
            className="h-9 rounded-full px-3.5 text-xs font-medium"
          >
            Essential Only
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="rw-privacy-storage-details"
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Details &amp; Data
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Expandable Truthful Storage & Data Inventory */}
        {expanded && (
          <div
            id="rw-privacy-storage-details"
            className="mt-4 space-y-3 border-t border-border/70 pt-3.5"
          >
            <div className="max-h-[min(46vh,340px)] space-y-2.5 overflow-y-auto pr-1">
              {/* Essential Security & Auth */}
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      <span className="text-xs font-semibold text-foreground">
                        Essential Security &amp; Session
                      </span>
                      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
                        Always Active
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Strictly required for Client Portal auth &amp; MFA (<code className="font-mono text-foreground">sb-*</code>),
                      Cloudflare Turnstile anti-bot checks on forms/login, and storing your choice
                      in <code className="font-mono text-foreground">rw_cookie_consent</code>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Optional Site Experience */}
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      <span className="text-xs font-semibold text-foreground">
                        Site Experience &amp; Preloading
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border/80 bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                        Optional
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Enables light/dark <code className="font-mono text-foreground">theme</code>{' '}
                      memory and idle-time <code className="font-mono text-foreground">/blogs</code>{' '}
                      pagination preloading for faster navigation.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={experienceEnabled}
                    aria-label="Toggle optional site experience storage and blog preloading"
                    onClick={() => setExperienceEnabled((prev) => !prev)}
                    className={cn(
                      'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                      experienceEnabled
                        ? 'border-primary bg-primary'
                        : 'border-border bg-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                        experienceEnabled ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Explicit Data Collection Inventory */}
              <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">
                    Data Collected Only When You Interact
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    <strong className="font-medium text-foreground">Contact &amp; Orders:</strong>{' '}
                    Name, email, optional company/phone, project scope, private Cloudflare R2 files
                    (90-day purge if unconverted), <code className="font-mono text-foreground">v2</code>{' '}
                    consent audit, and salted SHA-256 IP rate-limit hash.
                  </li>
                  <li>
                    <strong className="font-medium text-foreground">Client Portal:</strong>{' '}
                    Row-level protected orders, messages, invoices, and deliverables.
                  </li>
                  <li>
                    <strong className="font-medium text-foreground">Third-Party Ad Trackers:</strong>{' '}
                    <span className="font-mono text-foreground">0 active</span> (no Google
                    Analytics, ad pixels, or data brokers).
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Link
                href="/privacy"
                className="text-[11px] font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary"
              >
                Full Privacy &amp; Data Policy
              </Link>
              <Button
                type="button"
                size="sm"
                onClick={() => persistConsent(experienceEnabled)}
                className="h-8 rounded-full px-4 text-xs font-semibold"
              >
                Save Choices
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
