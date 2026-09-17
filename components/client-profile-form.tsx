'use client';
import {useState,useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {editClientProfileAction} from '@/lib/crm/workflow-actions';
export function ClientProfileForm({client}:{client:{id:string;full_name:string|null;company:string|null}}) {
  const [state,setState]=useState<{error?:string;notice?:string}>({});
  const [pending,start]=useTransition();
  return <form className="space-y-3" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setState({});start(async()=>setState(await editClientProfileAction(client.id,{full_name:String(data.get('full_name')??''),company:String(data.get('company')??'')})));}}>
    <div className="space-y-1"><Label htmlFor={`name-${client.id}`}>Name</Label><Input id={`name-${client.id}`} name="full_name" defaultValue={client.full_name??''} maxLength={200} disabled={pending}/></div>
    <div className="space-y-1"><Label htmlFor={`company-${client.id}`}>Company</Label><Input id={`company-${client.id}`} name="company" defaultValue={client.company??''} maxLength={200} disabled={pending}/></div>
    {state.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.notice&&<p role="status" className="text-sm">{state.notice}</p>}
    <Button type="submit" size="sm" disabled={pending}>{pending?'Saving...':'Save profile'}</Button>
  </form>;
}
