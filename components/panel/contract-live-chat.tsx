'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ContractChatMessage {
  id: string;
  body: string;
  created_at: string;
  is_internal_note?: boolean;
  author_id?: string;
  author?: {
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
}

export interface ActiveContractOption {
  id: string;
  code: string;
  title: string;
  status: string;
  initialMessages?: ContractChatMessage[];
}

interface ContractLiveChatProps {
  contracts: ActiveContractOption[];
  viewerRole: 'admin' | 'client';
  viewerId?: string;
  showPortalLink?: boolean;
}

export function ContractLiveChat({
  contracts,
  viewerRole,
  viewerId,
  showPortalLink = false,
}: ContractLiveChatProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    contracts[0]?.id ?? ''
  );
  const selectedContract =
    contracts.find((c) => c.id === selectedOrderId) ?? contracts[0];

  const [messages, setMessages] = useState<ContractChatMessage[]>(
    selectedContract?.initialMessages ?? []
  );
  const [draft, setDraft] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const pollMessages = useCallback(async (orderId: string) => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ContractChatMessage[] };
      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch {
      // Ignore transient network errors during background poll
    }
  }, []);

  const handleManualRefresh = async () => {
    if (!selectedOrderId || refreshing) return;
    setRefreshing(true);
    try {
      await pollMessages(selectedOrderId);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectContract = (orderId: string) => {
    setSelectedOrderId(orderId);
    setMessages(contracts.find((c) => c.id === orderId)?.initialMessages ?? []);
  };

  useEffect(() => {
    if (!selectedOrderId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pollMessages(selectedOrderId);

    const interval = setInterval(() => {
      void pollMessages(selectedOrderId);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedOrderId, pollMessages]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !selectedOrderId || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${selectedOrderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: trimmed,
          is_internal_note: viewerRole === 'admin' && isInternalNote,
        }),
      });
      const data = (await res.json()) as {
        message?: ContractChatMessage;
        error?: string;
      };
      if (!res.ok || !data.message) {
        setError(data.error || 'Could not send message.');
        return;
      }
      setMessages((prev) => [...prev, data.message!]);
      setDraft('');
      setIsInternalNote(false);
    } catch {
      setError('Network error while sending message.');
    } finally {
      setSending(false);
    }
  };

  if (!selectedContract) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/35 bg-card/90 shadow-xs">
      {/* Contract Header & Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-primary/5 px-5 py-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              LIVE CONTRACT CHAT
            </span>
            <Badge variant="outline" className="font-mono text-[11px]">
              {selectedContract.code}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              {selectedContract.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <h3 className="text-sm font-bold sm:text-base">{selectedContract.title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {contracts.length > 1 && (
            <select
              value={selectedOrderId}
              onChange={(e) => handleSelectContract(e.target.value)}
              className="h-8 rounded-full border border-border bg-background px-3 font-mono text-xs"
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title.slice(0, 32)}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleManualRefresh()}
            className="h-8 gap-1 rounded-full text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Sync
          </Button>
          {showPortalLink && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
              <Link
                href={
                  viewerRole === 'admin'
                    ? `/admin/orders/${selectedContract.id}`
                    : `/portal/orders/${selectedContract.id}`
                }
              >
                Open Contract Workspace
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        className="max-h-96 space-y-3 overflow-y-auto p-5"
      >
        {messages.length > 0 ? (
          messages.map((msg) => {
            const isAdminAuthor =
              msg.author?.role === 'admin' ||
              (viewerRole === 'admin' && msg.author_id === viewerId);
            const authorLabel = isAdminAuthor
              ? 'Md Redwan Ahmed (C|EH)'
              : msg.author?.full_name || msg.author?.email || 'Client';

            return (
              <div
                key={msg.id}
                className={cn(
                  'rounded-xl border p-3.5 text-xs transition-colors',
                  msg.is_internal_note
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : isAdminAuthor
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border/80 bg-background/80'
                )}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    {isAdminAuthor ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {authorLabel}
                    {msg.is_internal_note && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                        <Lock className="h-2.5 w-2.5" />
                        Internal Admin Note
                      </span>
                    )}
                  </span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-foreground/95">
                  {msg.body}
                </p>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
            Contract chat is active. Send a message below to communicate directly with{' '}
            {viewerRole === 'admin' ? 'the client' : 'Md Redwan Ahmed'}.
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="space-y-3 border-t border-border/70 bg-muted/20 p-4"
      >
        {error && (
          <p className="text-xs font-medium text-destructive">{error}</p>
        )}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          required
          placeholder={
            viewerRole === 'admin'
              ? 'Write a live contract update to the client or record an internal note...'
              : 'Send a direct message regarding your active contract, scope, or deliverables...'
          }
          className="bg-background text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {viewerRole === 'admin' ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(e) => setIsInternalNote(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Private Internal Note (Hidden from Client)
            </label>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">
              Encrypted direct contract channel · Real-time sync
            </span>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={sending || !draft.trim()}
            className="gap-1.5 rounded-full"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send Message
          </Button>
        </div>
      </form>
    </div>
  );
}
