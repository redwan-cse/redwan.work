import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import type {ProjectRow,PortalProjectRow} from '@/lib/crm/projects';
import type {InvoiceRow,InvoiceViewer,InvoiceStatus} from '@/lib/crm/invoices';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function rows<T>(name:string,args:Record<string,unknown>):Promise<T[]>{try{const {data,error}=await getSupabaseAdmin().rpc(name,args);if(error||!Array.isArray(data)||data.length>1000)throw new Error();return data as T[];}catch{throw new Error('Complete collection unavailable. Use the paginated view.');}}
export async function listProjects(opts:{archived?:boolean}={}):Promise<ProjectRow[]>{return rows('legacy_project_rows',{p_client:null,p_archived:opts.archived??null});}
export async function listArchivedProjects():Promise<Array<Pick<ProjectRow,'id'|'name'|'client_name'|'archived_at'>>>{return (await listProjects({archived:true})).map(({id,name,client_name,archived_at})=>({id,name,client_name,archived_at}));}
export async function listOwnProjects(clientId:string):Promise<PortalProjectRow[]>{if(!UUID.test(clientId))throw new Error('Invalid client.');return rows('legacy_project_rows',{p_client:clientId,p_archived:false});}
export async function listInvoices(viewer:InvoiceViewer,status?:InvoiceStatus):Promise<InvoiceRow[]>{if(!viewer||!UUID.test(viewer.userId)||!['admin','client'].includes(viewer.role))throw new Error('Unauthorized.');return rows('legacy_invoice_rows',{p_actor:viewer.userId,p_role:viewer.role,p_status:status??null});}
async function count(client:string|null):Promise<number>{try{const {data,error}=await getSupabaseAdmin().rpc('outstanding_invoice_count',{p_client:client});const value=typeof data==='number'?data:typeof data==='string'&&/^\d+$/.test(data)?Number(data):NaN;if(error||!Number.isSafeInteger(value)||value<0)throw new Error();return value;}catch{throw new Error('Invoice count unavailable.');}}
export async function countUnpaidInvoices():Promise<number>{return count(null);}
export async function countOwnOutstandingInvoices(clientId:string):Promise<number>{if(!UUID.test(clientId))return 0;return count(clientId);}
