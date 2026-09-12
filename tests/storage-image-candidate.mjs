// Replacement candidate validation only; production/test runner image remains unchanged.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {randomBytes} from 'node:crypto';import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand,HeadObjectCommand,ListObjectsV2Command,DeleteObjectCommand,DeleteBucketCommand} from '@aws-sdk/client-s3';import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
const image='cgr.dev/chainguard/minio@sha256:039800e64ec7247d2fde7cff3697e964f6fe20b6d7d2c46aa7d82cc63355d512';
const root=process.env.RUNNER_TEMP,config=mkdtempSync(join(root,'public-image-')),name='image-s3-'+randomBytes(6).toString('hex');
const access='synthetic-'+randomBytes(8).toString('hex'),secret=randomBytes(32).toString('hex');
const env={PATH:process.env.PATH,HOME:process.env.HOME,DOCKER_CONFIG:config,MINIO_ROOT_USER:access,MINIO_ROOT_PASSWORD:secret};
const run=args=>spawnSync('docker',args,{env,encoding:'utf8',timeout:120000});
const endpoint='http://127.0.0.1:19000',Bucket='candidate-fixture';
const client=new S3Client({endpoint,region:'auto',forcePathStyle:true,credentials:{accessKeyId:access,secretAccessKey:secret}});
const report={phase:'pull',passed:false,cleanup:false};let created=false;
try{
 assert.equal(run(['pull','--platform','linux/amd64',image]).status,0);
 const metadata=JSON.parse(run(['image','inspect',image]).stdout)[0];assert.ok(metadata.RepoDigests.includes(image));assert.equal(metadata.Architecture,'amd64');assert.equal(metadata.Config.User.split(':')[0],'65532');
 report.phase='startup';assert.equal(run(['run','-d','--name',name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--publish','127.0.0.1:19000:9000','--tmpfs','/data:rw,nosuid,nodev,size=128m,uid=65532,gid=65532','--tmpfs','/tmp:rw,nosuid,nodev,size=32m','--env','MINIO_ROOT_USER','--env','MINIO_ROOT_PASSWORD',image,'server','/data','--address',':9000','--console-address',':9001','--anonymous']).status,0);
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(endpoint+'/minio/health/ready')).ok){ready=true;break;}}catch{}await delay(250);}assert.ok(ready);
 report.phase='bucket';await client.send(new CreateBucketCommand({Bucket}));created=true;
 const bytes=randomBytes(2048),Key='fixture.bin';
 report.phase='signed-put';const url=await getSignedUrl(client,new PutObjectCommand({Bucket,Key,ContentType:'application/octet-stream',ContentLength:bytes.length}),{expiresIn:60});assert.ok((await fetch(url,{method:'PUT',body:bytes,headers:{'Content-Type':'application/octet-stream'}})).ok);
 report.phase='head-get';assert.equal((await client.send(new HeadObjectCommand({Bucket,Key}))).ContentLength,bytes.length);const read=await client.send(new GetObjectCommand({Bucket,Key}));assert.deepEqual(Buffer.from(await read.Body.transformToByteArray()),bytes);
 report.phase='invalid-signature';const bad=new URL(url);const signature=bad.searchParams.get('X-Amz-Signature');assert.ok(signature);bad.searchParams.set('X-Amz-Signature',(signature[0]==='0'?'1':'0')+signature.slice(1));assert.equal((await fetch(bad,{method:'PUT',body:bytes,headers:{'Content-Type':'application/octet-stream'}})).status,403);
 report.phase='list-delete';const listed=await client.send(new ListObjectsV2Command({Bucket}));assert.equal(listed.KeyCount,1);assert.equal(listed.Contents[0].Key,Key);await client.send(new DeleteObjectCommand({Bucket,Key}));await client.send(new DeleteObjectCommand({Bucket,Key}));assert.equal((await client.send(new ListObjectsV2Command({Bucket}))).KeyCount,0);
 await client.send(new DeleteBucketCommand({Bucket}));created=false;report.passed=true;report.phase='complete';
}catch{/* Only finite phase/outcomes leave this process. Signed URLs and raw responses remain private. */}
finally{
 let clean=true;if(created)try{const rows=await client.send(new ListObjectsV2Command({Bucket}));assert.equal(Boolean(rows.IsTruncated),false);for(const row of rows.Contents??[])await client.send(new DeleteObjectCommand({Bucket,Key:row.Key}));await client.send(new DeleteBucketCommand({Bucket}));}catch{clean=false;}
 client.destroy();run(['rm','-fv',name]);clean=clean&&run(['inspect',name]).status!==0;rmSync(config,{recursive:true,force:true});report.cleanup=clean;writeFileSync(join(root,'candidate-storage.json'),JSON.stringify(report),{mode:0o600});
}
console.log('Candidate S3 test phase='+report.phase+' passed='+report.passed+' cleanup='+report.cleanup);process.exit(report.passed&&report.cleanup?0:1);
