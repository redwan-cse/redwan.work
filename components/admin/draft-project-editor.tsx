import Link from 'next/link';
import {DraftInvoiceForm} from '@/components/admin/invoice-forms';
import {invoiceProjectOptions} from '@/lib/crm/invoice-project-options';
import type {InvoiceRow,InvoiceItemRow} from '@/lib/crm/invoices';
export async function DraftProjectEditor({invoice,items,page,search}:{invoice:InvoiceRow;items:InvoiceItemRow[];page?:string;search?:string}){
 const result=await invoiceProjectOptions(page,search);
 // Always retain the current selection, even when outside the searched page.
 const choices=result.items.some(p=>p.id===invoice.project_id)?result.items:[{id:invoice.project_id,name:invoice.project_name,client_name:invoice.client_name,client_email:invoice.client_email},...result.items];
 const href=(p:number)=>`?projectPage=${p}&projectSearch=${encodeURIComponent(result.search)}`;
 return <section className="space-y-3 print:hidden"><details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Find a different project</summary><form className="mt-3 flex flex-wrap gap-2"><label htmlFor="draft-project-search" className="sr-only">Project name</label><input id="draft-project-search" name="projectSearch" defaultValue={result.search} maxLength={200} className="rounded-md border bg-background px-3 py-2" placeholder="Project name"/><button type="submit" className="rounded-md border px-3 py-2">Search projects</button></form><p className="mt-2 text-xs text-muted-foreground">Search before editing fields. Navigating project choices discards unsaved form edits; the current saved project stays selectable.</p><nav className="mt-2 flex gap-4 text-sm" aria-label="Draft project choices">{result.page>1&&<Link href={href(result.page-1)}>Previous projects</Link>}{result.total>result.page*25&&<Link href={href(result.page+1)}>Next projects</Link>}</nav></details><DraftInvoiceForm key={`${invoice.id}:${result.page}:${result.search}`} invoice={invoice} items={items} projects={choices}/></section>;
}
