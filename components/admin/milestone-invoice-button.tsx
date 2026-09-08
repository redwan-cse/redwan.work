'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {invoiceMilestoneAction} from '@/lib/crm/workflow-actions';
export function MilestoneInvoiceButton({milestoneId}:{milestoneId:string}) {
  const [error,setError]=useState<string|null>(null);const [pending,start]=useTransition();const router=useRouter();
  return <div className="space-y-1"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>{setError(null);start(async()=>{const result=await invoiceMilestoneAction(milestoneId);if(result.error||!result.invoiceId){setError(result.error??'Could not create draft.');return;}router.push(`/admin/invoices/${result.invoiceId}`);});}}>{pending?'Preparing...':'Create or open milestone draft'}</Button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
