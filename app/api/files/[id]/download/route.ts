import {NextRequest,NextResponse} from 'next/server';
import {getCurrentSession} from '@/lib/auth/session';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getOwnedFileUrl} from '@/lib/crm/files';
function missing(){return NextResponse.json({error:'File not found.'},{status:404,headers:{'Cache-Control':'no-store'}});}
export async function GET(_request:NextRequest,ctx:{params:Promise<{id:string}>}) {
 const session=await getCurrentSession();
 if(!session){
  // A verified but no-longer-authorized identity gets the same opaque response
  // as a foreign file. Truly anonymous/invalid authentication remains 401.
  try{const client=await createSupabaseServerClient();const {data,error}=await client.auth.getClaims();if(!error&&typeof data?.claims?.sub==='string'&&data.claims.sub)return missing();}catch{}
  return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
 }
 const {id}=await ctx.params;if(!/^[0-9a-f-]{36}$/.test(id))return missing();
 try{const result=await getOwnedFileUrl(id,{userId:session.userId,role:session.role});if(!result.ok)return missing();const response=NextResponse.redirect(result.url,302);response.headers.set('Cache-Control','private, no-store');return response;}
 catch{return missing();}
}
