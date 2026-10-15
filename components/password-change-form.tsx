'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {changePasswordAction,type PasswordChangeState} from '@/lib/auth/password-change';

export function PasswordChangeForm(){
  const [state,setState]=useState<PasswordChangeState>({});
  const [pending,setPending]=useState(false);
  const busy=useRef(false);
  const stopped=useRef(false);
  const terminal=!!state.status&&state.status!=='denied'&&state.status!=='complete';
  return <section aria-labelledby="password-heading" className="space-y-3 border-t pt-5">
    <h2 id="password-heading" className="text-lg font-semibold">Change password</h2>
    <p id="password-policy" className="text-sm text-muted-foreground">Use at least 12 characters. Keep this session and sign out other sessions. Already-issued access tokens may work until they expire.</p>
    <form aria-label="Change password" aria-describedby="password-policy" aria-busy={pending} className="space-y-3" onSubmit={async event=>{
      event.preventDefault();
      if(busy.current||stopped.current)return;
      const element=event.currentTarget;
      const data=new FormData(element);
      busy.current=true;setPending(true);setState({});
      try{
        const result=await changePasswordAction({},data);
        stopped.current=!!result.status&&result.status!=='denied'&&result.status!=='complete';
        setState(result);
      }catch{
        stopped.current=true;
        setState({status:'update-unconfirmed',error:'The request outcome is unknown. Do not submit again automatically. Sign out and check the new password, or use password recovery.'});
      }finally{
        // Passwords stay out of component state and are cleared after every attempt.
        element.reset();data.delete('currentPassword');data.delete('password');data.delete('confirm');
        busy.current=false;setPending(false);
      }
    }}>
      <div className="space-y-1"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" maxLength={4096} required disabled={pending||terminal}/></div>
      <div className="space-y-1"><Label htmlFor="new-password">New password</Label><Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={4096} required disabled={pending||terminal} aria-describedby="password-policy"/></div>
      <div className="space-y-1"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={4096} required disabled={pending||terminal}/></div>
      {state.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.notice&&<p role="status" className="text-sm">{state.notice}</p>}
      <Button type="submit" className="min-h-11" disabled={pending||terminal}>{pending?'Changing password...':'Change password'}</Button>
    </form>
    <p className="text-sm text-muted-foreground">Forgotten or never set a password? Sign out first, then choose Forgot password? on the <Link className="underline underline-offset-4" href="/login">sign-in page</Link>. Recovery and invitations are unchanged.</p>
  </section>;
}
