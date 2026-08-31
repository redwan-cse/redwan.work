import Link from 'next/link';
import { listProjects } from '@/lib/crm/projects';
import { NewInvoiceForm } from '@/components/admin/invoice-forms';
export const dynamic = 'force-dynamic';
export default async function NewInvoicePage() { const projects = await listProjects({ archived: false }); const active = projects.filter((p) => p.status === 'active'); return <div className="max-w-3xl space-y-6"><Link href="/admin/invoices" className="text-sm text-muted-foreground hover:underline">← All invoices</Link><div><h1 className="text-2xl font-semibold">New invoice</h1><p className="mt-1 text-sm text-muted-foreground">Create a draft for an active project.</p></div>{active.length === 0 ? <p className="text-sm text-muted-foreground">No active projects are available for invoicing.</p> : <NewInvoiceForm projects={active.map((p) => ({ id: p.id, name: p.name, client_name: p.client_name, client_email: p.client_email }))} />}</div>; }
