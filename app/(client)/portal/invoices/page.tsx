import Link from 'next/link';
import {invoicePage} from '@/lib/crm/invoice-page';
import {InvoicePageTable} from '@/components/invoice-page-table';
export const dynamic='force-dynamic';
export default async function PortalInvoicesPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const result=await invoicePage('client',(await searchParams).page,null);
 return <section className="space-y-6"><h1 className="text-2xl font-semibold">Invoices</h1><InvoicePageTable items={result.items} role="client"/><nav aria-label="Invoice pages" className="flex gap-4">{result.page>1&&<Link href={`?page=${result.page-1}`}>Previous</Link>}{result.total>result.page*25&&<Link href={`?page=${result.page+1}`}>Next</Link>}</nav></section>;
}
