'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import type { ActiveContractOption } from '@/components/panel/contract-live-chat';

const LazyContractLiveChat = dynamic(
  () => import('@/components/panel/contract-live-chat').then((m) => m.ContractLiveChat),
  { ssr: false }
);

interface ActiveContractsPayload {
  authenticated: boolean;
  viewerRole?: 'admin' | 'client';
  viewerId?: string;
  contracts: ActiveContractOption[];
}

export function ContactActiveChat() {
  const [data, setData] = useState<ActiveContractsPayload | null>(null);

  useEffect(() => {
    // Skip anonymous network fetch when no Supabase session cookie is present
    if (
      typeof document !== 'undefined' &&
      !/\bsb-[^=]+-auth-token/i.test(document.cookie)
    ) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    fetch('/api/contact/active-contracts', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: ActiveContractsPayload | null) => {
        if (active && payload?.authenticated && Array.isArray(payload.contracts) && payload.contracts.length > 0) {
          setData(payload);
        }
      })
      .catch(() => {
        // Non-blocking enhancement for logged-in users
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (!data || !data.authenticated || !data.viewerId || data.contracts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Badge className="mb-1 gap-1.5 font-mono text-[11px]">
            ACTIVE CONTRACT WORKSPACE
          </Badge>
          <h2 className="text-xl font-bold tracking-tight">
            {data.viewerRole === 'admin'
              ? 'Active Client Contract Threads'
              : 'Live Contract Chat with Md. Redwan Ahmed'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {data.viewerRole === 'admin'
              ? 'Respond directly to active client contracts or open the full Admin Order Workspace.'
              : 'Your contract is active. Message directly here or open your full Contract Workspace in the Portal.'}
          </p>
        </div>
      </div>
      <LazyContractLiveChat
        contracts={data.contracts}
        viewerRole={data.viewerRole === 'admin' ? 'admin' : 'client'}
        viewerId={data.viewerId}
        showPortalLink
      />
    </div>
  );
}
