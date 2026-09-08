import Link from 'next/link';
import {NewInvoiceForm} from '@/components/admin/invoice-forms';
import {invoiceProjectOptions} from '@/lib/crm/invoice-project-options';
export const dynamic='force-dynamic';
export default async function NewInvoicePage({searchParams}:{searchParams:Promise<{page?:string;q?:string}>}){
 const params=await searchParams;const result=await invoiceProjectOptions(params.page,params.q);
 const href=(page:number)=>`?page=${page}&q=${encodeURIComponent(result.search)}`;
 return <div className="max-w-3xl space-y-6"><Link href="/admin/invoices" className="text-sm underline">All invoices</Link><div><h1 className="text-2xl font-semibold">New invoice</h1><p className="mt-1 text-sm text-muted-foreground">Create a draft for an active project. Search before entering invoice details; changing the choices page starts a new form.</p></div><form className="flex flex-wrap items-end gap-2"><div className="space-y-1"><label htmlFor="invoice-project-search" className="text-sm font-medium">Find project by name</label><input id="invoice-project-search" name="q" defaultValue={result.search} maxLength={200} className="block rounded-md border bg-background px-3 py-2"/></div><button className="rounded-md border px-3 py-2" type="submit">Search projects</button></form><nav aria-label="Project choices" className="flex gap-4 text-sm">{result.page>1&&<Link href={href(result.page-1)}>Previous projects</Link>}{result.total>result.page*25&&<Link href={href(result.page+1)}>Next projects</Link>}</nav>{result.items.length===0?<p className="text-sm text-muted-foreground">No active projects match this page. Adjust the search or return to Projects.</p>:<NewInvoiceForm key={`${result.page}:${result.search}`} projects={result.items}/>}</div>;
}
