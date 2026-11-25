'use client';

import * as React from 'react';
import Script from 'next/script';
import {
  allowsAnalyticsStorage,
  COOKIE_PREFERENCES_CHANGED_EVENT,
  type CookieConsentState,
} from '@/components/cookie-preferences';

function resolveGaId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!raw || !/^G-[A-Z0-9]{4,}$/i.test(raw)) return null;
  return raw;
}

function resolveClarityId(): string | null {
  const raw = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!raw || !/^[a-z0-9]{6,}$/i.test(raw)) return null;
  return raw;
}

interface WindowWithAnalytics extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
}

function pushConsentSignals(analyticsGranted: boolean) {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) return;
  const w = window as WindowWithAnalytics;
  const state = analyticsGranted ? 'granted' : 'denied';

  if (typeof w.gtag === 'function') {
    w.gtag('consent', 'update', {
      analytics_storage: state,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  if (typeof w.clarity === 'function') {
    w.clarity('consentv2', {
      ad_Storage: 'denied',
      analytics_Storage: state,
    });
  }
}

function bootstrapAnalyticsRuntime(gaId: string | null, clarityId: string | null) {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) return;

  const w = window as WindowWithAnalytics;
  const granted = allowsAnalyticsStorage();
  const state = granted ? 'granted' : 'denied';

  if (gaId) {
    w.dataLayer = w.dataLayer || [];
    if (typeof w.gtag !== 'function') {
      w.gtag = function gtag(...args: unknown[]) {
        w.dataLayer?.push(args);
      };
    }
    w.gtag('consent', 'default', {
      analytics_storage: state,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    });
    w.gtag('js', new Date());
    w.gtag('config', gaId, {});
  }

  if (clarityId) {
    if (typeof w.clarity !== 'function') {
      const clarityQueueFn = ((...args: unknown[]) => {
        clarityQueueFn.q = clarityQueueFn.q || [];
        clarityQueueFn.q.push(args);
      }) as ((...args: unknown[]) => void) & { q?: unknown[] };
      w.clarity = clarityQueueFn;
    }
    w.clarity('consentv2', {
      ad_Storage: 'denied',
      analytics_Storage: state,
    });
  }
}

export function trackAnalyticsEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window === 'undefined') return;
  if (!allowsAnalyticsStorage()) return;
  const w = window as WindowWithAnalytics;
  if (typeof w.gtag === 'function') {
    w.gtag('event', eventName, params ?? {});
  }
}

export function AnalyticsScripts() {
  const gaId = resolveGaId();
  const clarityId = resolveClarityId();

  React.useEffect(() => {
    if (!gaId && !clarityId) return;

    bootstrapAnalyticsRuntime(gaId, clarityId);

    // Sync live consent changes immediately whenever the visitor saves or updates choices
    const onConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentState>).detail;
      const analyticsGranted =
        detail && typeof detail.analytics === 'boolean'
          ? detail.analytics
          : allowsAnalyticsStorage();
      pushConsentSignals(analyticsGranted);
    };

    const onStorageChange = () => {
      pushConsentSignals(allowsAnalyticsStorage());
    };

    window.addEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, onConsentChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      window.removeEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, onConsentChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [gaId, clarityId]);

  if (!gaId && !clarityId) return null;

  return (
    <>
      {gaId && (
        <Script
          id="ga4-gtag-src"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
          strategy="lazyOnload"
          onLoad={() => pushConsentSignals(allowsAnalyticsStorage())}
        />
      )}
      {clarityId && (
        <Script
          id="ms-clarity-loader"
          src={`https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`}
          strategy="lazyOnload"
          onLoad={() => pushConsentSignals(allowsAnalyticsStorage())}
        />
      )}
    </>
  );
}
