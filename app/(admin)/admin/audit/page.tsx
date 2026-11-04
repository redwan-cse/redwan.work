import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogPage() {
  const admin = getSupabaseAdmin();
  const { data: logs } = await admin
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <Activity className="h-3.5 w-3.5" />
          APPEND-ONLY SECURITY &amp; COMPLIANCE LEDGER
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Immutable Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Protected by database trigger `guard_audit_logs_immutable` — records cannot be updated or deleted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest 100 Audit Events</CardTitle>
          <CardDescription>Tracks proposals, orders, RoE signatures, R2 file downloads, and payment reviews.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="divide-y divide-border/70 text-xs">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.action}
                    </Badge>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {entry.actor_role}
                    </Badge>
                    <span className="font-medium text-foreground">{entry.summary}</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No audit events recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
