import Link from 'next/link';
import {invoicePage} from '@/lib/crm/invoice-page';
import {InvoicePageTable} from '@/components/invoice-page-table';
export const dynamic='force-dynamic';
export default async function AdminInvoicesPage({searchParams}:{searchParams:Promise<{page?:string;status?:string}>}) {
 const search=await searchParams;const result=await invoicePage('admin',search.page,search.status);
 const href=(page:number)=>`?page=${page}${result.status?`&status=${result.status}`:''}`;
 return <section className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Invoices</h1><Link className="rounded-md border px-3 py-2 underline" href="/admin/invoices/new">New invoice</Link></header><nav aria-label="Invoice filters" className="flex flex-wrap gap-3">{['all','draft','sent','paid','void'].map(status=><Link key={status} className="rounded-md border px-3 py-1.5 capitalize" aria-current={(result.status??'all')===status?'page':undefined} href={status==='all'?'/admin/invoices':`?status=${status}`}>{status}</Link>)}</nav><InvoicePageTable items={result.items} role="admin"/><nav aria-label="Invoice pages" className="flex gap-4">{result.page>1&&<Link href={href(result.page-1)}>Previous</Link>}{result.total>result.page*25&&<Link href={href(result.page+1)}>Next</Link>}</nav></section>;
}
