import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
interface AuthUserLike{id:string;email?:string;app_metadata?:Record<string,unknown>;}
export async function findAuthUserByEmail(email:string):Promise<{id:string;email:string;role:string|undefined}|null>{
 if(typeof email!=='string'||!email.trim())throw new Error('Account lookup unavailable.');
 const target=email.trim().toLowerCase();const admin=getSupabaseAdmin();const perPage=200;const seen=new Set<string>();
 try{
  for(let page=1;page<=500;page++){
   const {data,error}=await admin.auth.admin.listUsers({page,perPage});
   if(error||!data||!Array.isArray(data.users))throw new Error('Account lookup unavailable.');
   const users=data.users as AuthUserLike[];
   for(const user of users){if(typeof user.id!=='string'||!user.id||seen.has(user.id))throw new Error('Account lookup unavailable.');seen.add(user.id);}
   const match=users.find(user=>typeof user.email==='string'&&user.email.trim().toLowerCase()===target);
   if(match){const role=match.app_metadata?.role;return {id:match.id,email:match.email??target,role:typeof role==='string'?role:undefined};}
   const total=data.total;
   if(users.length<perPage){if(typeof total==='number'&&Number.isFinite(total)&&total>seen.size)throw new Error('Account lookup incomplete.');return null;}
   // A missing total on a full page is not proof of absence. Read the next page.
   if(typeof total==='number'&&Number.isSafeInteger(total)&&total>=0&&seen.size>=total)return null;
  }
 }catch{throw new Error('Account lookup unavailable.');}
 // Bounded resource use without falsely reporting an existing account absent.
 throw new Error('Account lookup unavailable.');
}
