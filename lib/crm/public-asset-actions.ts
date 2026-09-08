'use server';
import {createHash} from 'crypto';
import {workflowSession} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {preparePublicAsset,confirmPublicAsset,validateAssetMetadata,type AssetMetadata} from '@/lib/r2-public-upload';
export async function prepareAssetUploadAction(input:AssetMetadata):Promise<{error?:string;key?:string;uploadUrl?:string}> {
 const session=await workflowSession('admin');if(!session)return {error:'Unauthorized.'};
 if(!validateAssetMetadata(input))return {error:'Choose a supported file between 1 byte and 5 MB with a matching MIME type.'};
 const salt=process.env.LEAD_IP_HASH_SALT;if(!salt)return {error:'Asset uploads are temporarily unavailable.'};
 try {
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'presign-portal',p_key_hash:createHash('sha256').update(salt+session.userId).digest('hex'),p_window_seconds:60,p_max_count:3});
  if(error||typeof data!=='boolean')return {error:'Asset uploads are temporarily unavailable.'};
  if(!data)return {error:'Too many uploads. Please try again later.'};
  return await preparePublicAsset(input);
 }catch{return {error:'Asset uploads are temporarily unavailable.'};}
}
export async function confirmAssetUploadAction(key:string,input:AssetMetadata):Promise<{error?:string;url?:string}> {
 if(!await workflowSession('admin'))return {error:'Unauthorized.'};
 try{const url=await confirmPublicAsset(key,input);return url?{url}:{error:'Stored file does not match the declared upload. Please retry.'};}
 catch{return {error:'Asset confirmation is temporarily unavailable.'};}
}
