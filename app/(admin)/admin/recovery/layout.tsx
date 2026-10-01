import type {ReactNode} from 'react';
import {redirect} from 'next/navigation';
import {workflowSession} from '@/lib/crm/workflow-access';

export const dynamic='force-dynamic';

export default async function RecoveryLayout({children}:{children:ReactNode}) {
  if(!await workflowSession('admin',{requireUnbannedAuthUser:true}))redirect('/login');
  return children;
}
