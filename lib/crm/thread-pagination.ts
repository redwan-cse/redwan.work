import 'server-only';
export const THREAD_PAGE_SIZE=50;
export interface ThreadCursor {v:1;ticketId:string;createdAt:string;id:string;direction:'older'|'newer';}
export interface ThreadPageInfo {olderCursor:string|null;newerCursor:string|null;isLatest:boolean;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function timestamp(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))return false;
 const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===value.slice(0,19);
}
export function decodeThreadCursor(raw:unknown,ticketId:string):ThreadCursor|null|false {
 if(raw===undefined||raw===null||raw==='')return null;
 if(typeof raw!=='string'||raw.length>512||!/^[-_A-Za-z0-9]+$/.test(raw))return false;
 try{
  const bytes=Buffer.from(raw,'base64url');if(bytes.toString('base64url')!==raw)return false;
  const c:unknown=JSON.parse(bytes.toString('utf8'));if(!c||typeof c!=='object'||Array.isArray(c))return false;
  const x=c as Record<string,unknown>;
  if(Object.keys(x).sort().join(',')!=='createdAt,direction,id,ticketId,v'||x.v!==1||x.ticketId!==ticketId||!UUID.test(ticketId)||typeof x.id!=='string'||!UUID.test(x.id)||!timestamp(x.createdAt)||(x.direction!=='older'&&x.direction!=='newer'))return false;
  return x as unknown as ThreadCursor;
 }catch{return false;}
}
export function encodeThreadCursor(ticketId:string,row:{id:string;created_at:string},direction:'older'|'newer'):string {
 if(!UUID.test(ticketId)||!UUID.test(row.id)||!timestamp(row.created_at))throw new Error('Invalid thread boundary.');
 return Buffer.from(JSON.stringify({v:1,ticketId,createdAt:row.created_at,id:row.id,direction})).toString('base64url');
}
export function threadCursorFilter(cursor:ThreadCursor):string {
 // Called only after strict grammar validation. Preserve database microseconds verbatim.
 const op=cursor.direction==='older'?'lt':'gt';
 return `created_at.${op}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${op}.${cursor.id})`;
}
export function threadWindow<T extends {id:string;created_at:string}>(ticketId:string,rows:T[],cursor:ThreadCursor|null):{rows:T[];pageInfo:ThreadPageInfo} {
 const extra=rows.length>THREAD_PAGE_SIZE;const visible=rows.slice(0,THREAD_PAGE_SIZE);
 if(cursor?.direction!=='newer')visible.reverse();
 const first=visible[0],last=visible[visible.length-1];
 const hasOlder=cursor?.direction==='newer'?true:extra;
 const hasNewer=cursor?.direction==='older'?true:cursor?.direction==='newer'?extra:false;
 return {rows:visible,pageInfo:{olderCursor:first&&hasOlder?encodeThreadCursor(ticketId,first,'older'):null,newerCursor:last&&hasNewer?encodeThreadCursor(ticketId,last,'newer'):null,isLatest:!cursor||(cursor.direction==='newer'&&!extra)}};
}
