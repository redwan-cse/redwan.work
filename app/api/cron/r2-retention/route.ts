import {NextRequest,NextResponse} from 'next/server';
import {requireBearer} from '@/lib/auth/bearer';
import {isR2Configured} from '@/lib/r2';
import {privateInventoryPage} from '@/lib/r2-inventory';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {drainStorageDeletions,purgeArchivedProject} from '@/lib/crm/retention';
export async function GET(request:NextRequest) {
 if(!requireBearer(process.env.CRON_SECRET,request.headers.get('authorization')))return NextResponse.json({message:'Invalid or missing credentials'},{status:401});
 if(!isR2Configured())return NextResponse.json({message:'Attachment storage is not configured.'},{status:503});
 const result={deleted:0,examined:0,projectsPurged:0,archivePurged:0,errors:[] as string[]};
 const conflict=()=>NextResponse.json({message:'Maintenance progress changed. Retry the sweep.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
 try {
  const admin=getSupabaseAdmin();
  const cursors=await admin.from('maintenance_cursors').select('name,last_key');
  if(cursors.error||cursors.data?.length!==3)throw new Error('Maintenance progress unavailable');
  const positions=new Map<string,string>(cursors.data.map(row=>[row.name,row.last_key]));
  for(const name of ['contact','private'] as const) {
   const page=await privateInventoryPage(name==='contact'?'contact/':'private/',positions.get(name)??'');
   result.examined+=page.items.length;
   for(const item of page.items) {
    const claim=await admin.rpc('claim_expired_storage',{p_key:item.key,p_modified:item.modified});
    if(claim.error)throw new Error('Storage reference claim failed');
   }
   const saved=await admin.from('maintenance_cursors').update({last_key:page.next,updated_at:new Date().toISOString()},{count:'exact'}).eq('name',name).eq('last_key',positions.get(name)??'');
   if(saved.error)throw new Error('Maintenance progress save failed');
   if(saved.count!==1)return conflict();
  }
  let query=admin.from('projects').select('id').lt('archived_at',new Date(Date.now()-30*86400000).toISOString()).order('id').limit(10);
  const after=positions.get('projects')??'';if(after)query=query.gt('id',after);
  const projects=await query;
  if(projects.error)throw new Error('Project inventory unavailable');
  for(const project of projects.data??[]) {
   const prepared=await purgeArchivedProject(project.id);
   if(prepared.ok)result.projectsPurged++;else result.errors.push('Project cleanup held for recovery or financial retention review.');
  }
  const rows=projects.data??[];
  const progress=await admin.from('maintenance_cursors').update({last_key:rows.length===10?rows[rows.length-1].id:'',updated_at:new Date().toISOString()},{count:'exact'}).eq('name','projects').eq('last_key',after);
  if(progress.error)throw new Error('Project progress save failed');
  if(progress.count!==1)return conflict();
  const drained=await drainStorageDeletions();result.deleted=drained.completed;
  if(drained.failed)result.errors.push('Storage deletions require retry.');
  return NextResponse.json(result,{status:result.errors.length?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{console.error('Retention sweep failed.');return NextResponse.json({message:'Retention sweep failed. Tracking records are preserved.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
