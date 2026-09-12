import Link from 'next/link';
import type {ThreadPageInfo} from '@/lib/crm/thread-pagination';
export function ThreadNavigation({base,pageInfo}:{base:string;pageInfo:ThreadPageInfo}){
 return <nav aria-label="Conversation pages" className="flex flex-wrap items-center gap-4 text-sm">
  {pageInfo.olderCursor&&<Link className="underline focus-visible:outline" href={`${base}?cursor=${encodeURIComponent(pageInfo.olderCursor)}#conversation`}>Older messages</Link>}
  {pageInfo.newerCursor&&<Link className="underline focus-visible:outline" href={`${base}?cursor=${encodeURIComponent(pageInfo.newerCursor)}#conversation`}>Newer messages</Link>}
  {!pageInfo.isLatest?<><span>Viewing message history</span><Link className="underline focus-visible:outline" href={`${base}#conversation`}>Latest messages</Link></>:<span>Latest messages</span>}
 </nav>;
}
export function ThreadReadError({kind,base,cursor}:{kind:'invalid_cursor'|'unavailable';base:string;cursor:unknown}){
 const retry=typeof cursor==='string'&&cursor.length<=512?`${base}?cursor=${encodeURIComponent(cursor)}`:base;
 return <section className="space-y-3" aria-label="Conversation unavailable"><h1 className="text-xl font-semibold">{kind==='invalid_cursor'?'Invalid conversation page':'Conversation temporarily unavailable'}</h1><p role="alert">{kind==='invalid_cursor'?'This page link is invalid. Return to the latest messages.':'We could not load this conversation. Please try again.'}</p>{kind==='unavailable'&&<a className="underline mr-4" href={retry}>Retry conversation</a>}<Link className="underline" href={base}>Latest messages</Link></section>;
}
