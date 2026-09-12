import 'server-only';
import {HeadObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {ASSET_MAX_BYTES,makeAssetKey,assetUrl} from '@/lib/r2';
import {extFromFilename,isAllowedAssetMime} from '@/lib/mime';
export type AssetMetadata={filename:string;mime:string;size:number};
export function validateAssetMetadata(value:unknown):AssetMetadata|null {
 if(!value||typeof value!=='object')return null;
 const v=value as Partial<AssetMetadata>;
 if(typeof v.filename!=='string'||!v.filename.trim()||v.filename.length>255||typeof v.mime!=='string'||v.mime.length>128||!Number.isSafeInteger(v.size)||v.size!<1||v.size!>ASSET_MAX_BYTES)return null;
 const mime=v.mime.trim().toLowerCase().split(';')[0].trim();
 if(!isAllowedAssetMime(extFromFilename(v.filename),mime))return null;
 return {filename:v.filename,mime,size:v.size!};
}
function client():S3Client {
 const endpoint=process.env.R2_ENDPOINT;const accessKeyId=process.env.R2_PUBLIC_ACCESS_KEY_ID;const secretAccessKey=process.env.R2_PUBLIC_SECRET_ACCESS_KEY;
 if(!endpoint||!accessKeyId||!secretAccessKey||!process.env.R2_PUBLIC_BUCKET)throw new Error('Public storage unavailable.');
 // Path-style signing uses the existing endpoint CSP origin, not a new bucket hostname.
 return new S3Client({region:'auto',endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
}
export async function preparePublicAsset(input:AssetMetadata):Promise<{key:string;uploadUrl:string}> {
 const meta=validateAssetMetadata(input);if(!meta)throw new Error('Invalid asset metadata.');
 const key=makeAssetKey(extFromFilename(meta.filename));assetUrl(key);
 const storage=client();
 try{return {key,uploadUrl:await getSignedUrl(storage,new PutObjectCommand({Bucket:process.env.R2_PUBLIC_BUCKET,Key:key,ContentType:meta.mime,ContentLength:meta.size}),{expiresIn:600})};}
 finally{storage.destroy();}
}
export async function confirmPublicAsset(key:string,input:AssetMetadata):Promise<string|null> {
 const meta=validateAssetMetadata(input);
 if(!meta||typeof key!=='string'||!/^assets\/\d{4}\/[0-9a-f]{32}\.(png|jpg|webp|svg|avif|pdf)$/.test(key)||!key.endsWith(`.${extFromFilename(meta.filename)}`))return null;
 const storage=client();
 try{const result=await storage.send(new HeadObjectCommand({Bucket:process.env.R2_PUBLIC_BUCKET,Key:key}));if(result.ContentLength!==meta.size||result.ContentType?.split(';')[0].trim().toLowerCase()!==meta.mime)return null;return assetUrl(key);}
 catch{return null;}finally{storage.destroy();}
}
