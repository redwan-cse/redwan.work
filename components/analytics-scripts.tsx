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

  const gaBootstrapScript = gaId
    ? `(function(){try{if(typeof navigator!=='undefined'&&navigator.webdriver===true)return;window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=window.gtag||gtag;var granted=true;try{var raw=window.localStorage.getItem('redwan_work_cookie_preferences_v1');if(raw){var parsed=JSON.parse(raw);if(parsed&&parsed.essential===true&&typeof parsed.analytics==='boolean'){granted=parsed.analytics;}else if(parsed&&parsed.experience===false){granted=false;}}}catch(e){}gtag('consent','default',{analytics_storage:granted?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());gtag('config',${JSON.stringify(gaId)},{anonymize_ip:true});}catch(e){}})();`
    : null;

  const clarityBootstrapScript = clarityId
    ? `(function(c,l,a,r,i,t,y){try{if(typeof navigator!=='undefined'&&navigator.webdriver===true)return;c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};var granted=true;try{var raw=c.localStorage.getItem('redwan_work_cookie_preferences_v1');if(raw){var parsed=JSON.parse(raw);if(parsed&&parsed.essential===true&&typeof parsed.analytics==='boolean'){granted=parsed.analytics;}else if(parsed&&parsed.experience===false){granted=false;}}}catch(e){}c[a]('consentv2',{ad_Storage:'denied',analytics_Storage:granted?'granted':'denied'});t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);}catch(e){}})(window,document,'clarity','script',${JSON.stringify(clarityId)});`
    : null;

  return (
    <>
      {gaId && gaBootstrapScript && (
        <>
          <Script id="ga4-consent-bootstrap" strategy="afterInteractive">
            {gaBootstrapScript}
          </Script>
          <Script
            id="ga4-gtag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
            strategy="afterInteractive"
            onLoad={() => pushConsentSignals(allowsAnalyticsStorage())}
          />
        </>
      )}
      {clarityId && clarityBootstrapScript && (
        <Script
          id="ms-clarity-loader"
          strategy="afterInteractive"
          onLoad={() => pushConsentSignals(allowsAnalyticsStorage())}
        >
          {clarityBootstrapScript}
        </Script>
      )}
    </>
  );
}
