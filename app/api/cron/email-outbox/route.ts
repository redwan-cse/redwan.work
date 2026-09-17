import {NextRequest,NextResponse} from 'next/server';
import {requireBearer} from '@/lib/auth/bearer';
import {drainEmailOutbox} from '@/lib/email/outbox';
export async function GET(request:NextRequest) {
 if(!requireBearer(process.env.CRON_SECRET,request.headers.get('authorization')))return NextResponse.json({error:'Unauthorized.'},{status:401});
 try {const result=await drainEmailOutbox();return NextResponse.json(result,{status:result.failed||result.deferred?503:200,headers:{'Cache-Control':'no-store'}});}
 catch {console.error('Email outbox processing failed.');return NextResponse.json({error:'Email outbox processing failed.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
