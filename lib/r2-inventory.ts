import 'server-only';
import {ListObjectsV2Command,S3Client} from '@aws-sdk/client-s3';
export async function privateInventoryPage(prefix:'contact/'|'private/',after:string):Promise<{items:Array<{key:string;modified:string}>;next:string}> {
 const endpoint=process.env.R2_ENDPOINT;const bucket=process.env.R2_PRIVATE_BUCKET;const accessKeyId=process.env.R2_PRIVATE_ACCESS_KEY_ID;const secretAccessKey=process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
 if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new Error('Storage unavailable.');
 if(after&&!after.startsWith(prefix))throw new Error('Invalid inventory cursor.');
 const client=new S3Client({region:'auto',endpoint,credentials:{accessKeyId,secretAccessKey}});
 try {
  const result=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,StartAfter:after||undefined,MaxKeys:100}));
  const items=[];let previous=after;
  for(const object of result.Contents??[]) {
   if(!object.Key||!object.LastModified||!object.Key.startsWith(prefix)||object.Key<=previous)throw new Error('Storage inventory incomplete.');
   previous=object.Key;items.push({key:object.Key,modified:object.LastModified.toISOString()});
  }
  if(result.IsTruncated&&!items.length)throw new Error('Storage inventory made no progress.');
  return {items,next:result.IsTruncated?previous:''};
 }finally{client.destroy();}
}
