import {createServerClient,parseCookieHeader} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
const AUTH_PAGES=new Set(['/login','/reset-password']);
function panelHome(role:unknown):string|null{return role==='admin'?'/admin':role==='client'?'/portal':null;}
export async function proxy(request:NextRequest):Promise<NextResponse> {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const {pathname,search}=request.nextUrl;const authPage=AUTH_PAGES.has(pathname)||pathname.startsWith('/invite/');const login=new URL('/login',request.url);
 if(!url||!key){if(authPage)return NextResponse.next();login.searchParams.set('next',pathname+search);return NextResponse.redirect(login);}
 let response=NextResponse.next({request:{headers:request.headers}});
 const supabase=createServerClient(url,key,{cookies:{getAll(){return parseCookieHeader(request.cookies.toString());},setAll(cookies,headers){cookies.forEach(({name,value})=>request.cookies.set(name,value));const previous=response;response=NextResponse.next({request:{headers:request.headers}});carry(previous,response);cookies.forEach(({name,value,options})=>response.cookies.set(name,value,{...options,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'}));Object.entries(headers??{}).forEach(([name,value])=>response.headers.set(name,value));}}});
 try {
  const {data,error}=await supabase.auth.getClaims();const claims=data?.claims;const userId=claims?.sub;const role=claims?.app_metadata?.role;
  if(error||typeof userId!=='string'||!userId){if(authPage)return response;login.searchParams.set('next',pathname+search);return carry(response,NextResponse.redirect(login));}
  if(pathname==='/reset-password'||pathname.startsWith('/invite/'))return response;
  const profile=await supabase.from('profiles').select('role,is_active').eq('id',userId).maybeSingle();
  if(profile.error)return unavailable(response);
  const home=panelHome(role);
  if(!home||!profile.data||profile.data.is_active!==true||profile.data.role!==role){
   if(pathname==='/login')return response;
   const logout=new URL('/api/auth/logout',request.url);
   let inactive=profile.data?.is_active===false;
   if(!profile.data){
    const state=await supabase.rpc('caller_account_state');
    if(state.error)return unavailable(response);
    inactive=state.data==='inactive';
   }
   if(inactive)logout.searchParams.set('reason','deactivated');
   return carry(response,NextResponse.redirect(logout));
  }
  if(pathname==='/login'||(pathname.startsWith('/admin')&&role!=='admin')||(pathname.startsWith('/portal')&&role!=='client'))return carry(response,NextResponse.redirect(new URL(home,request.url)));
  return response;
 }catch{console.error('Route authority check unavailable.');return unavailable(response);}
}
function carry(base:NextResponse,target:NextResponse):NextResponse {
 base.cookies.getAll().forEach(cookie=>target.cookies.set(cookie.name,cookie.value,cookie));
 for(const name of ['cache-control','expires','pragma','vary']){const value=base.headers.get(name);if(value)target.headers.set(name,value);}
 return target;
}
function unavailable(base:NextResponse):NextResponse {const response=carry(base,new NextResponse('Authentication is temporarily unavailable.',{status:503}));response.headers.set('Cache-Control','no-store');return response;}
export const config={matcher:['/admin/:path*','/portal/:path*','/login','/reset-password','/invite/:path*']};
