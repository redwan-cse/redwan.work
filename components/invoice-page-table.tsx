import Link from 'next/link';
import {Badge} from '@/components/ui/badge';
import type {InvoiceRow} from '@/lib/crm/invoices';
function money(value:number,currency:string){return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value)/100);}
export function InvoicePageTable({items,role}:{items:InvoiceRow[];role:'admin'|'client'}) {
 if(!items.length)return <p className="text-sm text-muted-foreground">No invoices in this view.</p>;
 return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Invoice</th>{role==='admin'&&<th className="p-3">Client</th>}<th className="p-3">Project</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Outstanding</th><th className="p-3">Status</th><th className="p-3">Due</th></tr></thead><tbody>{items.map(item=><tr key={item.id} className="border-t"><td className="p-3"><Link className="underline" href={`/${role==='admin'?'admin':'portal'}/invoices/${item.id}`}>INV-{item.number}</Link></td>{role==='admin'&&<td className="p-3">{item.client_name??item.client_email}</td>}<td className="p-3">{item.project_name}</td><td className="p-3 text-right">{money(item.total_cents,item.currency)}</td><td className="p-3 text-right">{money(item.outstanding_cents,item.currency)}</td><td className="p-3"><Badge variant="outline">{item.status}</Badge></td><td className="p-3">{item.due_at??'Not set'}</td></tr>)}</tbody></table></div>;
}
