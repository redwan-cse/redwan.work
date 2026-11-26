import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Download, Lock } from 'lucide-react';
import { AdminTicketReplyForm } from '@/components/admin/admin-ticket-reply-form';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSession } from '@/lib/auth/session';
import { updateTicketStatusAction } from '@/lib/crm/actions';

export const dynamic = 'force-dynamic';

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminSession();
  const admin = getSupabaseAdmin();

  const [{ data: ticket }, { data: messages }, { data: ticketFiles }] = await Promise.all([
    admin.from('tickets').select('*').eq('id', id).maybeSingle(),
    admin
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('vault_files')
      .select('id, filename, size_bytes')
      .eq('ticket_id', id),
  ]);

  if (!ticket) notFound();

  const { data: clientProfile } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', ticket.client_id)
    .maybeSingle();

  const fileMap = new Map(
    (ticketFiles ?? []).map((vf) => [vf.id, vf])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/support"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Support Queue
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold text-primary">{ticket.code}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {ticket.status}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs uppercase">
              {ticket.priority}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {ticket.category}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{ticket.subject}</h1>
          <p className="text-xs text-muted-foreground">
            Client:{' '}
            <Link href={`/admin/clients/${ticket.client_id}`} className="text-primary hover:underline">
              {clientProfile?.full_name || clientProfile?.email || ticket.client_id}
            </Link>
          </p>
        </div>

        <ActionFeedbackForm
          action={updateTicketStatusAction}
          successMessage="Ticket status updated."
          className="flex items-center gap-2"
        >
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <select
            name="status"
            aria-label="Ticket status"
            defaultValue={ticket.status}
            className="h-9 rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
          >
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="awaiting_client">awaiting_client</option>
            <option value="answered">answered</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
          <Button type="submit" variant="outline" size="sm" className="h-9 rounded-full text-xs">
            Update Status
          </Button>
        </ActionFeedbackForm>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversation Thread</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {(messages ?? []).map((msg) => {
              const ids: string[] = Array.isArray(msg.attachment_file_ids)
                ? (msg.attachment_file_ids as string[])
                : [];
              const attached = ids
                .map((fid) => fileMap.get(fid))
                .filter((vf): vf is { id: string; filename: string; size_bytes: number } =>
                  Boolean(vf)
                );
              return (
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
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
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
                  {attached.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {attached.map((vf) =>
                        vf ? (
                          <a
                            key={vf.id}
                            href={`/api/files/${vf.id}/download`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 font-mono text-[11px] text-primary hover:underline"
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
            })}
          </div>

          <AdminTicketReplyForm ticketId={ticket.id} clientId={ticket.client_id} />
        </CardContent>
      </Card>
    </div>
  );
}
