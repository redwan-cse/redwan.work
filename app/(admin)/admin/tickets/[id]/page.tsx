import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Lock, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { replyTicketAction, updateTicketStatusAction } from '@/lib/crm/actions';

export const dynamic = 'force-dynamic';

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: ticket }, { data: messages }] = await Promise.all([
    admin.from('tickets').select('*').eq('id', id).maybeSingle(),
    admin
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (!ticket) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/tickets"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Tickets
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-primary">{ticket.code}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {ticket.status}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs uppercase">
              {ticket.priority}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{ticket.subject}</h1>
        </div>

        <form action={updateTicketStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <select
            name="status"
            defaultValue={ticket.status}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
          >
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="waiting_on_client">waiting_on_client</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
          <Button type="submit" variant="outline" size="sm" className="h-9 rounded-full text-xs">
            Update Status
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversation Thread</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {(messages ?? []).map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border p-4 text-xs ${
                  msg.is_internal_note
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-border/80 bg-card'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {msg.author_id === ticket.client_id ? 'Client' : 'Admin (Md Redwan Ahmed)'}
                    {msg.is_internal_note && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                        <Lock className="h-2.5 w-2.5" />
                        Internal Note
                      </span>
                    )}
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
              </div>
            ))}
          </div>

          <form action={replyTicketAction} className="space-y-3 border-t border-border/70 pt-4">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <Textarea
              name="body"
              required
              rows={4}
              placeholder="Write a reply to the client or an internal note..."
              className="text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="is_internal_note"
                  className="h-4 w-4 rounded border-border"
                />
                Internal Admin Note (Hidden from Client)
              </label>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Send className="h-3.5 w-3.5" />
                Send Reply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
