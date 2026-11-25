'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  ExternalLink,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { resolveMimeType } from '@/lib/mime';
import { cn } from '@/lib/utils';

export interface ContractChatAttachment {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}

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
  attachments?: ContractChatAttachment[];
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    r2_key: string;
    filename: string;
    mime: string;
    size_bytes: number;
    sha256_checksum: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCreatedAtRef = useRef<string | null>(
    (selectedContract?.initialMessages ?? []).at(-1)?.created_at ?? null
  );
  const etagRef = useRef<string | null>(null);
  const idlePollsRef = useRef(0);

  const pollMessages = useCallback(
    async (orderId: string, options?: { full?: boolean }): Promise<boolean> => {
      if (!orderId) return false;
      const useDelta = !options?.full && Boolean(lastCreatedAtRef.current);
      const url = useDelta
        ? `/api/orders/${orderId}/messages?after=${encodeURIComponent(lastCreatedAtRef.current!)}`
        : `/api/orders/${orderId}/messages`;

      try {
        const headers: Record<string, string> = {};
        if (!options?.full && etagRef.current) {
          headers['If-None-Match'] = etagRef.current;
        }
        const res = await fetch(url, {
          cache: 'no-store',
          headers,
        });
        if (res.status === 304) {
          return false;
        }
        if (!res.ok) return false;

        const nextEtag = res.headers.get('etag');
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        const data = (await res.json()) as {
          messages?: ContractChatMessage[];
          delta?: boolean;
        };
        if (!Array.isArray(data.messages)) return false;

        if (useDelta || data.delta) {
          if (data.messages.length === 0) return false;
          const incoming = data.messages;
          const latest = incoming[incoming.length - 1];
          if (latest?.created_at) {
            lastCreatedAtRef.current = latest.created_at;
            etagRef.current = null;
          }
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const msg of incoming) {
              if (!seen.has(msg.id)) {
                seen.add(msg.id);
                merged.push(msg);
              }
            }
            return merged;
          });
          return true;
        }

        const latest = data.messages[data.messages.length - 1];
        lastCreatedAtRef.current = latest?.created_at ?? null;
        setMessages(data.messages);
        return data.messages.length > 0;
      } catch {
        // Ignore transient network errors during background poll
        return false;
      }
    },
    []
  );

  const handleManualRefresh = async () => {
    if (!selectedOrderId || refreshing) return;
    setRefreshing(true);
    etagRef.current = null;
    idlePollsRef.current = 0;
    try {
      await pollMessages(selectedOrderId, { full: true });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectContract = (orderId: string) => {
    setSelectedOrderId(orderId);
    const nextInitial = contracts.find((c) => c.id === orderId)?.initialMessages ?? [];
    setMessages(nextInitial);
    lastCreatedAtRef.current = nextInitial.at(-1)?.created_at ?? null;
    etagRef.current = null;
    idlePollsRef.current = 0;
  };

  const hasInitialMessagesForSelected = contracts.some(
    (c) => c.id === selectedOrderId && Array.isArray(c.initialMessages)
  );

  useEffect(() => {
    if (!selectedOrderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const getPollDelayMs = () => {
      if (idlePollsRef.current >= 8) return 30_000;
      if (idlePollsRef.current >= 4) return 15_000;
      return 5_000;
    };

    const scheduleNext = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (typeof document !== 'undefined' && document.hidden) {
          scheduleNext();
          return;
        }
        const hadUpdates = await pollMessages(selectedOrderId);
        idlePollsRef.current = hadUpdates ? 0 : idlePollsRef.current + 1;
        scheduleNext();
      }, getPollDelayMs());
    };

    if (!hasInitialMessagesForSelected) {
      void pollMessages(selectedOrderId, { full: true }).finally(scheduleNext);
    } else {
      scheduleNext();
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        idlePollsRef.current = 0;
        void pollMessages(selectedOrderId).finally(scheduleNext);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedOrderId, hasInitialMessagesForSelected, pollMessages]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedOrderId) return;

    setUploadingFile(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const effectiveMime = resolveMimeType(file.name, file.type);

      const presignRes = await fetch('/api/uploads/portal-presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime: effectiveMime,
          size: file.size,
          category: 'order_attachment',
          orderId: selectedOrderId,
        }),
      });
      if (!presignRes.ok) {
        const body = (await presignRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not presign attachment upload.');
      }
      const { key, uploadUrl, mime: resolvedMime } = (await presignRes.json()) as {
        key: string;
        uploadUrl: string;
        mime?: string;
      };
      const contentType = resolvedMime || effectiveMime;

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error('Direct upload to Encrypted Vault failed.');
      }

      setPendingAttachment({
        r2_key: key,
        filename: file.name,
        mime: contentType,
        size_bytes: file.size,
        sha256_checksum: sha256,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attachment upload failed.');
    } finally {
      setUploadingFile(false);
    }
  };

  const submitMessage = async () => {
    const trimmed = draft.trim() || (pendingAttachment ? `Attached file: ${pendingAttachment.filename}` : '');
    if (!trimmed || !selectedOrderId || sending || uploadingFile) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${selectedOrderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: trimmed,
          is_internal_note: viewerRole === 'admin' && isInternalNote,
          ...(pendingAttachment ? { attachment: pendingAttachment } : {}),
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
      const newMsg = data.message!;
      if (newMsg.created_at) {
        lastCreatedAtRef.current = newMsg.created_at;
      }
      etagRef.current = null;
      idlePollsRef.current = 0;
      setMessages((prev) =>
        prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
      );
      setDraft('');
      setPendingAttachment(null);
      setIsInternalNote(false);
    } catch {
      setError('Network error while sending message.');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage();
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
          <h2 className="text-sm font-bold sm:text-base">{selectedContract.title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {contracts.length > 1 && (
            <select
              aria-label="Select active contract thread"
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
        role="log"
        aria-live="polite"
        aria-label="Live contract messages"
        className="max-h-96 space-y-3 overflow-y-auto p-5"
      >
        {messages.length > 0 ? (
          messages.map((msg) => {
            const isAdminAuthor =
              msg.author?.role === 'admin' ||
              (viewerRole === 'admin' && msg.author_id === viewerId);
            const authorLabel = isAdminAuthor
              ? 'Md. Redwan Ahmed'
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
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
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
                {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/api/files/${att.id}/download`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/80 px-2.5 py-1 font-mono text-[11px] font-medium text-primary hover:bg-primary/10 hover:underline"
                      >
                        <Download className="h-3 w-3 shrink-0" />
                        <span className="max-w-[200px] truncate">{att.filename}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({(att.size_bytes / 1024).toFixed(1)} KB)
                        </span>
                      </a>
                    ))}
                  </div>
                )}
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
          <p role="alert" className="text-xs font-medium text-destructive">{error}</p>
        )}
        {pendingAttachment && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary">
            <span className="inline-flex items-center gap-1.5 truncate">
              <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pendingAttachment.filename}</span>
              <span className="text-[10px] text-muted-foreground">
                ({(pendingAttachment.size_bytes / 1024).toFixed(1)} KB)
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPendingAttachment(null)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <Textarea
          aria-label="Contract chat message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void submitMessage();
            }
          }}
          rows={3}
          required={!pendingAttachment}
          placeholder={
            viewerRole === 'admin'
              ? 'Write a live contract update to the client or record an internal note... (Ctrl+Enter to send)'
              : 'Send a direct message regarding your active contract, scope, or deliverables... (Ctrl+Enter to send)'
          }
          className="bg-background text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleAttachFile}
              className="hidden"
              aria-label="Attach file to contract message"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingFile || sending}
              onClick={() => fileInputRef.current?.click()}
              className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]"
            >
              {uploadingFile ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="h-3 w-3 text-primary" />
              )}
              {uploadingFile ? 'Uploading...' : 'Attach File'}
            </Button>
            {viewerRole === 'admin' ? (
              <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="h-6 w-6 rounded border-border accent-primary"
                />
                Private Internal Note (Hidden from Client)
              </label>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Encrypted direct contract channel · Real-time sync
              </span>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={sending || uploadingFile || (!draft.trim() && !pendingAttachment)}
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
