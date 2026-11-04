import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { replyTicketAction } from '@/lib/crm/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function ClientTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/tickets');

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: ticket } = await admin
    .from('tickets')
    .select(
      '*, order:orders(id, code, title), ticket_messages(*, author:profiles!ticket_messages_author_id_fkey(full_name, email, role))'
    )
    .eq('id', id)
    .maybeSingle();

  if (!ticket || (session.role !== 'admin' && ticket.client_id !== session.userId)) {
    notFound();
  }

  const messages = (Array.isArray(ticket.ticket_messages) ? ticket.ticket_messages : []).filter(
    (m: { is_internal_note?: boolean }) => !m.is_internal_note
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/tickets"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Support Tickets
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-primary">{ticket.code}</span>
          <Badge variant="outline" className="font-mono text-xs uppercase">
            {ticket.status}
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs uppercase">
            {ticket.priority}
          </Badge>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{ticket.subject}</h1>
      </div>

      <Card className="border-border/80 bg-card/85">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <MessageSquare className="h-4 w-4 text-primary" />
            Conversation Thread ({messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {messages.map(
              (msg: {
                id: string;
                body: string;
                created_at: string;
                author?: { full_name?: string | null; email?: string; role?: string } | null;
              }) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-border/70 bg-background/60 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {msg.author?.full_name || msg.author?.email || 'Support'}
                    </span>
                    <span>{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                </div>
              )
            )}
          </div>

          <form action={replyTicketAction} className="space-y-3 border-t border-border pt-4">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <Textarea
              name="body"
              rows={3}
              required
              placeholder="Write a reply..."
              className="text-xs"
            />
            <Button type="submit" size="sm">
              Post Reply
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
