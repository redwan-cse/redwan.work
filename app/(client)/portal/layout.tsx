import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {workflowSession} from '@/lib/crm/workflow-access';
import {PanelShell} from '@/components/panel/panel-shell';
export const metadata:Metadata={title:'Client portal · redwan.work',robots:{index:false,follow:false}};
const NAV=[{label:'Dashboard',href:'/portal',enabled:true},{label:'Tickets',href:'/portal/tickets',enabled:true},{label:'Projects',href:'/portal/projects',enabled:true},{label:'Files',href:'/portal/files',enabled:true},{label:'Invoices',href:'/portal/invoices',enabled:true},{label:'Profile',href:'/portal/profile',enabled:true}];
export default async function PortalLayout({children}:{children:React.ReactNode}) {
  const session=await workflowSession();
  if(!session)redirect('/login?next=/portal');
  if(session.role==='admin')redirect('/admin');
  return <PanelShell title="Client portal" userEmail={session.email} navItems={NAV} activeHref="/portal">{children}</PanelShell>;
}
