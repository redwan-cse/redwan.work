import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download, LifeBuoy } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { replyTicketAction } from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
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

  const [{ data: ticket }, { data: messages }, { data: ticketFiles }] = await Promise.all([
    admin
      .from('tickets')
      .select('*, order:orders(id, code, title)')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('ticket_messages')
      .select('*, author:profiles!ticket_messages_author_id_fkey(full_name, role)')
      .eq('ticket_id', id)
      .eq('is_internal_note', false)
      .order('created_at', { ascending: true }),
    admin.from('vault_files').select('id, filename, size_bytes').eq('ticket_id', id),
  ]);

  if (!ticket || (session.role !== 'admin' && ticket.client_id !== session.userId)) {
    notFound();
  }

  const fileMap = new Map((ticketFiles ?? []).map((vf) => [vf.id, vf]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/portal/tickets"
            className="inline-flex min-h-6 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Support Helpdesk
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-primary">{ticket.code}</span>
            <Badge variant="outline" className="font-mono text-xs uppercase">
              {ticket.status.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs uppercase">
              {ticket.priority}
            </Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight">{ticket.subject}</h1>
        </div>
      </div>

      <Card className="border-border/80 bg-card/85">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <LifeBuoy className="h-4 w-4 text-primary" />
            Ticket Conversation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {(messages ?? []).map(
              (msg: {
                id: string;
                body: string;
                created_at: string;
                attachment_file_ids?: string[];
                author?: { full_name?: string | null; role?: string | null } | null;
              }) => {
                const attachments = (msg.attachment_file_ids ?? [])
                  .map((fid) => fileMap.get(fid))
                  .filter(Boolean);
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl border p-3.5 text-xs ${
                      msg.author?.role === 'admin'
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/70 bg-background/60'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {msg.author?.role === 'admin'
                          ? 'Md. Redwan Ahmed (Security Engineer)'
                          : msg.author?.full_name || 'You'}
                      </span>
                      <span>{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                    {attachments.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {attachments.map((vf) =>
                          vf ? (
                            <a
                              key={vf.id}
                              href={`/api/files/${vf.id}/download`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 font-mono text-[11px] text-primary hover:underline"
                            >
                              <Download className="h-3 w-3" />
                              {vf.filename}
                            </a>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>

          <ActionFeedbackForm
            action={replyTicketAction}
            successMessage="Reply posted to support thread."
            resetOnSuccess
            className="space-y-3 border-t border-border/70 pt-4"
          >
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <Textarea
              name="body"
              aria-label="Ticket reply message"
              rows={3}
              required
              placeholder="Write a reply..."
            />
            <R2FileUploader
              category="ticket_attachment"
              orderId={ticket.order_id}
              label="Attach Log / Screenshot (Optional)"
            />
            <Button type="submit" size="sm">
              Post Reply
            </Button>
          </ActionFeedbackForm>
        </CardContent>
      </Card>
    </div>
  );
}
