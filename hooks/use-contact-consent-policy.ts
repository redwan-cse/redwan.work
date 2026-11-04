"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSENT_UNAVAILABLE_MESSAGE, parsePublicConsentPolicy } from '@/lib/contact/consent-client';
import type { PolicyBundle } from '@/lib/contact/consent-policy';

/** Initial read and explicit user refresh only. Never retries a submission. */
export function useContactConsentPolicy() {
  const [policy, setPolicy] = useState<PolicyBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const loadPolicy = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/contact', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      const next =
        result && typeof result === 'object' && 'policy' in result
          ? parsePublicConsentPolicy(result.policy)
          : null;
      if (!response.ok || !next) throw new Error('Consent policy unavailable');
      if (pending.current === controller) {
        setPolicy(next);
        setError(null);
      }
    } catch {
      if (pending.current === controller) setError(CONSENT_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setPolicy(null);
    setLoading(true);
    setError(null);
    await loadPolicy();
  }, [loadPolicy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPolicy();
    }, 0);
    return () => {
      clearTimeout(timer);
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    };
  }, [loadPolicy]);

  const replacePolicy = useCallback((value: unknown) => {
    const controller = pending.current;
    pending.current = null;
    controller?.abort();
    const next = parsePublicConsentPolicy(value);
    setPolicy(next);
    setLoading(false);
    setError(next ? null : CONSENT_UNAVAILABLE_MESSAGE);
  }, []);

  return { policy, loading, error, refresh, replacePolicy };
}
