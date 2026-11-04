import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminTicketsPage() {
  const admin = getSupabaseAdmin();
  const { data: tickets } = await admin
    .from('tickets')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <LifeBuoy className="h-3.5 w-3.5" />
          SUPPORT HELPDESK &amp; SLA
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Support Tickets (`TKT-XXXX`)</h1>
        <p className="text-sm text-muted-foreground">
          Respond to client tickets, track SLA targets, and record private internal notes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tickets Queue</CardTitle>
          <CardDescription>Sorted by most recent activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {tickets && tickets.length > 0 ? (
            <div className="divide-y divide-border/70">
              {tickets.map((tkt) => (
                <div
                  key={tkt.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/tickets/${tkt.id}`}
                        className="font-mono text-xs font-bold text-primary hover:underline"
                      >
                        {tkt.code}
                      </Link>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {tkt.status}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                        {tkt.priority}
                      </Badge>
                    </div>
                    <Link
                      href={`/admin/tickets/${tkt.id}`}
                      className="block text-base font-bold hover:text-primary"
                    >
                      {tkt.subject}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">
                      Updated{' '}
                      {formatDistanceToNow(new Date(tkt.last_message_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>

                  <Button asChild variant="outline" size="sm" className="gap-1 rounded-full text-xs">
                    <Link href={`/admin/tickets/${tkt.id}`}>
                      Open Thread <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No support tickets in the queue.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
