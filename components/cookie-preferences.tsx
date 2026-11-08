'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Cookie,
  Share2,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'redwan_work_cookie_preferences_v1';
export const OPEN_COOKIE_PREFERENCES_EVENT = 'redwan:open-cookie-preferences';

export interface CookieConsentState {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  social: boolean;
  updatedAt: string;
}

export function openCookiePreferencesModal() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
  }
}

export function CookiePreferencesTrigger() {
  return (
    <button
      type="button"
      onClick={openCookiePreferencesModal}
      className="hover:text-primary hover:underline"
    >
      Cookie Preferences
    </button>
  );
}

export function CookiePreferences() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [social, setSocial] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<CookieConsentState>;
          setAnalytics(Boolean(parsed.analytics));
          setMarketing(Boolean(parsed.marketing));
          setSocial(Boolean(parsed.social));
        } else if (!navigator.webdriver) {
          setVisible(true);
        }
      } catch {
        if (typeof navigator !== 'undefined' && !navigator.webdriver) {
          setVisible(true);
        }
      }
    }, 0);

    const handleOpen = () => {
      setVisible(true);
      setCustomizing(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
    };
  }, []);

  const persistConsent = (next: {
    analytics: boolean;
    marketing: boolean;
    social: boolean;
  }) => {
    const payload: CookieConsentState = {
      essential: true,
      analytics: next.analytics,
      marketing: next.marketing,
      social: next.social,
      updatedAt: new Date().toISOString(),
    };
    setAnalytics(next.analytics);
    setMarketing(next.marketing);
    setSocial(next.social);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      document.cookie = `rw_cookie_consent=${encodeURIComponent(
        JSON.stringify({
          e: 1,
          a: next.analytics ? 1 : 0,
          m: next.marketing ? 1 : 0,
          s: next.social ? 1 : 0,
        })
      )}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      // ignore storage errors in restricted environments
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie Preferences"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto w-auto max-w-xl rounded-2xl border border-border/80 bg-card/95 p-5 text-card-foreground shadow-xl backdrop-blur-md sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Cookie Preferences
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              We use cookies to ensure our website works properly and to improve your experience. You can choose which optional cookies to allow below. Read our{' '}
              <Link
                href="/privacy#cookies"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Cookie Policy
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Close cookie preferences"
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-13">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              persistConsent({ analytics: true, marketing: true, social: true })
            }
          >
            Accept All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              persistConsent({
                analytics: false,
                marketing: false,
                social: false,
              })
            }
          >
            Essential Only
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setCustomizing((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span>Customize</span>
          {customizing ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {customizing && (
        <div className="mt-4 space-y-2.5 border-t border-border/70 pt-4">
          {/* Essential */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Essential
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                    Required
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Required for authentication, CSRF/Turnstile security, and core site functionality. These cannot be disabled.
                </p>
              </div>
            </div>
            <Switch checked disabled aria-label="Essential cookies (required)" />
          </div>

          {/* Analytics */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground">
                  Analytics
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Help us understand how visitors interact with our website to improve performance and user experience.
                </p>
              </div>
            </div>
            <Switch
              checked={analytics}
              onCheckedChange={setAnalytics}
              aria-label="Allow analytics cookies"
            />
          </div>

          {/* Marketing */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground">
                  Marketing
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Used to measure campaign attribution and relevant consulting outreach.
                </p>
              </div>
            </div>
            <Switch
              checked={marketing}
              onCheckedChange={setMarketing}
              aria-label="Allow marketing cookies"
            />
          </div>

          {/* Social & Embeds */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Share2 className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground">
                  Social &amp; Embeds
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Enable content sharing and embedded third-party scheduling or media widgets.
                </p>
              </div>
            </div>
            <Switch
              checked={social}
              onCheckedChange={setSocial}
              aria-label="Allow social and embed cookies"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              className={cn('px-4')}
              onClick={() =>
                persistConsent({ analytics, marketing, social })
              }
            >
              Save Preferences
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
