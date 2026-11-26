import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  Columns3,
  List,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
import { CsvExportButton } from '@/components/admin/csv-export-button';
import { OrdersKanbanBoard } from '@/components/admin/orders-kanban-view';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormCheckbox } from '@/components/ui/form-checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSession } from '@/lib/auth/session';
import {
  createOrderFromAdminAction,
  resolveCancellationRequestAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; q?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const viewMode = params.view === 'kanban' ? 'kanban' : 'table';
  const statusFilter = (params.status ?? '').trim();
  const qFilter = (params.q ?? '').trim().toLowerCase();

  const admin = getSupabaseAdmin();
  let ordersQuery = admin
    .from('orders')
    .select(
      'id, code, client_id, title, pillar, status, progress_percent, requires_roe, roe_signed_at, total_cents, currency, due_at, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(250);
  if (statusFilter) {
    ordersQuery = ordersQuery.eq('status', statusFilter);
  }

  const [{ data: orders }, { data: clients }, { data: pendingCancels }] = await Promise.all([
    ordersQuery,
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
    admin
      .from('cancellation_requests')
      .select('id, order_id, reason, created_at, order:orders(code, title)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.full_name || c.email])
  );
  const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));

  const filteredOrders = (orders ?? [])
    .map((o) => ({
      ...o,
      clientName: clientMap.get(o.client_id) ?? 'Client',
    }))
    .filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (qFilter) {
        const haystack = `${o.code} ${o.title} ${o.clientName} ${o.pillar}`.toLowerCase();
        if (!haystack.includes(qFilter)) return false;
      }
      return true;
    });

  const buildViewHref = (nextView: 'table' | 'kanban') => {
    const qs = new URLSearchParams();
    qs.set('view', nextView);
    if (statusFilter) qs.set('status', statusFilter);
    if (params.q) qs.set('q', params.q);
    return `/admin/orders?${qs.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="ORDER EXECUTION PIPELINE"
        title="Client Orders & Deliverables (ORD-XXXX)"
        description="Manage active engagements in Table or Kanban board view, verify RoE authorizations, publish encrypted deliverables, and track milestones."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CsvExportButton
              filename="orders-export.csv"
              headers={['Code', 'Title', 'Client', 'Pillar', 'Status', 'Progress %', 'Currency', 'Total', 'RoE Signed']}
              rows={filteredOrders.map((o) => [
                o.code ?? '',
                o.title,
                o.clientName,
                o.pillar,
                o.status,
                o.progress_percent,
                o.currency,
                (o.total_cents / 100).toFixed(2),
                o.requires_roe ? (o.roe_signed_at ? 'Yes' : 'Pending') : 'N/A',
              ])}
            />
            <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5">
              <Link
                href={buildViewHref('table')}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </Link>
              <Link
                href={buildViewHref('kanban')}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  viewMode === 'kanban'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Kanban Board
              </Link>
            </div>
          </div>
        }
      />

      {/* Pending Cancellation Requests Banner */}
      {pendingCancels && pendingCancels.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Pending Order Cancellation Requests ({pendingCancels.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pendingCancels.map((req) => {
              const joinedOrder = Array.isArray(req.order) ? req.order[0] : req.order;
              const targetOrder = joinedOrder ?? orderMap.get(req.order_id);
              return (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/orders/${req.order_id}`}
                        className="font-mono font-bold text-primary hover:underline"
                      >
                        {targetOrder?.code ?? req.order_id.slice(0, 8)}
                      </Link>
                      <span className="font-medium">{targetOrder?.title}</span>
                    </div>
                    <p className="text-muted-foreground">{req.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionFeedbackForm
                      action={resolveCancellationRequestAction}
                      successMessage="Cancellation approved and order cancelled."
                    >
                      <input type="hidden" name="request_id" value={req.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Button type="submit" size="sm" variant="destructive" className="h-8 text-xs">
                        Approve Cancel
                      </Button>
                    </ActionFeedbackForm>
                    <ActionFeedbackForm
                      action={resolveCancellationRequestAction}
                      successMessage="Cancellation declined."
                    >
                      <input type="hidden" name="request_id" value={req.id} />
                      <input type="hidden" name="decision" value="declined" />
                      <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                        Decline
                      </Button>
                    </ActionFeedbackForm>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Search & Status Filter Strip */}
      <form method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card p-3">
        <input type="hidden" name="view" value={viewMode} />
        <Input
          name="q"
          aria-label="Search orders by code, title, client, or pillar"
          defaultValue={params.q ?? ''}
          placeholder="Filter by ORD code, title, client, or pillar..."
          className="h-9 min-w-[200px] flex-1"
        />
        <select
          name="status"
          aria-label="Filter orders by status"
          defaultValue={statusFilter}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-base font-sans transition-colors hover:border-muted-foreground/45"
        >
          <option value="">All Statuses</option>
          <option value="awaiting_payment">awaiting_payment</option>
          <option value="pending_requirements">pending_requirements</option>
          <option value="queued">queued</option>
          <option value="in_progress">in_progress</option>
          <option value="on_hold">on_hold</option>
          <option value="in_review">in_review</option>
          <option value="revision_requested">revision_requested</option>
          <option value="delivered">delivered</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
          Apply Filter
        </Button>
      </form>

      {viewMode === 'kanban' ? (
        <OrdersKanbanBoard orders={filteredOrders} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Create New Order Form */}
          <Card className="xl:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create Direct Order</CardTitle>
              <CardDescription className="text-xs">
                Initializes ORD-XXXX, milestones, and kickoff deposit invoice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={createOrderFromAdminAction}
                successMessage="Order created and deposit invoice issued."
                resetOnSuccess
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="direct-order-client" className="text-sm font-medium">Client *</Label>
                  <select
                    id="direct-order-client"
                    name="client_id"
                    aria-label="Order client"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                  >
                    <option value="">— Select Client —</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="direct-order-title" className="text-sm font-medium">Order Title *</Label>
                  <Input
                    id="direct-order-title"
                    name="title"
                    required
                    placeholder="Web & API Penetration Test (VAPT)"
                    className="h-10"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-pillar" className="text-sm font-medium">Service Pillar</Label>
                    <select
                      id="direct-order-pillar"
                      name="pillar"
                      aria-label="Order service pillar"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                    >
                      <option value="cybersecurity">Cybersecurity &amp; VAPT</option>
                      <option value="development">Full-Stack Dev</option>
                      <option value="cloud_devops">Cloud &amp; Linux Ops</option>
                      <option value="ai_ml">AI &amp; ML Pipeline</option>
                      <option value="tech_support">Executive Advisory</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-currency" className="text-sm font-medium">Currency</Label>
                    <select
                      id="direct-order-currency"
                      name="currency"
                      aria-label="Order currency"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                    >
                      <option value="USD">USD</option>
                      <option value="BDT">BDT</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-total" className="text-sm font-medium">Total *</Label>
                    <Input id="direct-order-total" name="total_usd" aria-label="Order total amount" type="number" step="0.01" required min="1" defaultValue="1000" className="h-10 tabular-nums" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-fx" className="text-sm font-medium">FX→USD</Label>
                    <Input id="direct-order-fx" name="fx_rate_to_usd" aria-label="Exchange rate to USD" type="number" step="0.0001" min="0.0001" defaultValue="1.0" className="h-10 tabular-nums" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-deposit" className="text-sm font-medium">Deposit %</Label>
                    <Input id="direct-order-deposit" name="deposit_percent" aria-label="Deposit percentage" type="number" min="0" max="100" defaultValue="50" className="h-10 tabular-nums" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direct-order-due" className="text-sm font-medium">Due Days</Label>
                    <Input id="direct-order-due" name="due_days" aria-label="Invoice due days" type="number" min="1" max="365" defaultValue="14" className="h-10 tabular-nums" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="direct-order-desc" className="text-sm font-medium">Scope Summary</Label>
                  <Textarea
                    id="direct-order-desc"
                    name="description"
                    rows={3}
                    placeholder="Key target environments, milestones, or SLA deliverables..."
                  />
                </div>

                <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs font-medium">
                  <FormCheckbox name="requires_roe" />
                  Require Rules of Engagement Signature
                </label>

                <Button type="submit" className="w-full gap-1.5 rounded-full">
                  <Plus className="h-4 w-4" />
                  Create Order &amp; Issue Deposit
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          {/* Compact Orders Table */}
          {(() => {
            const pagedOrders = paginateItems(
              filteredOrders,
              (params as Record<string, string | undefined>).page
            );
            return (
          <Card className="xl:col-span-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Orders Pipeline ({filteredOrders.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredOrders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code / Title</TableHead>
                      <TableHead className="text-xs">Client</TableHead>
                      <TableHead className="text-xs">Status &amp; Gate</TableHead>
                      <TableHead className="text-right text-xs">Value</TableHead>
                      <TableHead className="text-right text-xs">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedOrders.items.map((ord) => (
                      <TableRow key={ord.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/orders/${ord.id}`}
                              className="font-mono text-xs font-bold text-primary hover:underline"
                            >
                              {ord.code}
                            </Link>
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {ord.progress_percent}%
                            </Badge>
                          </div>
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            className="line-clamp-1 text-xs font-medium hover:text-primary"
                          >
                            {ord.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Link href={`/admin/clients/${ord.client_id}`} className="hover:underline">
                            {ord.clientName}
                          </Link>
                          <div className="font-mono text-[10px]">
                            {formatDistanceToNow(new Date(ord.created_at), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {ord.status.replace(/_/g, ' ')}
                          </Badge>
                          {ord.requires_roe && (
                            <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-primary">
                              <ShieldCheck className="h-3 w-3" />
                              {ord.roe_signed_at ? 'RoE Signed' : 'RoE Needed'}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {formatMoney(ord.total_cents, ord.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                            <Link href={`/admin/orders/${ord.id}`}>
                              Manage <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No orders match the current filter.
                </p>
              )}
              <AdminPagination
                basePath="/admin/orders"
                page={pagedOrders.page}
                totalPages={pagedOrders.totalPages}
                totalItems={pagedOrders.totalItems}
                startIndex={pagedOrders.startIndex}
                endIndex={pagedOrders.endIndex}
                query={{
                  view: viewMode,
                  status: statusFilter || undefined,
                  q: params.q || undefined,
                }}
              />
            </CardContent>
          </Card>
            );
          })()}
        </div>
      )}
    </div>
  );
}
