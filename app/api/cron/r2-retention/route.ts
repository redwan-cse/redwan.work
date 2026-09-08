import {NextRequest,NextResponse} from 'next/server';
import {requireBearer} from '@/lib/auth/bearer';
import {isR2Configured,listPrivateContactObjects,listPrivateObjects} from '@/lib/r2';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {drainStorageDeletions,purgeArchivedProject} from '@/lib/crm/retention';
export async function GET(request:NextRequest) {
  if(!requireBearer(process.env.CRON_SECRET,request.headers.get('authorization')))return NextResponse.json({message:'Invalid or missing credentials'},{status:401});
  if(!isR2Configured())return NextResponse.json({message:'Attachment storage is not configured.'},{status:503});
  const result={deleted:0,examined:0,projectsPurged:0,pendingCleaned:0,archivePurged:0,errors:[] as string[]};
  try {
    const admin=getSupabaseAdmin();
    // Each claim executes a complete SQL EXISTS query, never a truncated REST inventory.
    // The claim and reference triggers serialize by key, preventing late rebinding.
    const objects=[...await listPrivateContactObjects(),...await listPrivateObjects('private/')];
    result.examined=objects.length;
    const now=Date.now();
    const candidates=objects.filter(o=>o.key.startsWith('contact/')?o.lastModified.getTime()<now-90*86400000:o.key.includes('/pending/')&&o.lastModified.getTime()<now-86400000).sort((a,b)=>a.lastModified.getTime()-b.lastModified.getTime()).slice(0,100);
    for(const object of candidates) {
      const {error}=await admin.rpc('claim_expired_storage',{p_key:object.key,p_modified:object.lastModified.toISOString()});
      if(error)result.errors.push('Storage claim failed.');
    }
    // Small bounded batch; protected projects cannot cause object deletion.
    const projects=await admin.from('projects').select('id').lt('archived_at',new Date(now-30*86400000).toISOString()).order('archived_at').order('id').limit(10);
    if(projects.error)result.errors.push('Archived project lookup failed.');
    else for(const project of projects.data??[]) {
      const prepared=await purgeArchivedProject(project.id);
      if(prepared.ok)result.projectsPurged++;else result.errors.push('Project cleanup held for recovery or retention review.');
    }
    const drained=await drainStorageDeletions();result.deleted=drained.completed;
    if(drained.failed)result.errors.push('Some storage deletions require retry.');
    // Recovery archives are not independently swept. Their disposal requires an
    // approved recovery-retention policy, not age-based deletion of the only backup.
    return NextResponse.json(result,{status:result.errors.length?503:200,headers:{'Cache-Control':'no-store'}});
  } catch {
    console.error('Retention sweep failed.');
    return NextResponse.json({message:'Retention sweep failed. Tracking records are preserved.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
