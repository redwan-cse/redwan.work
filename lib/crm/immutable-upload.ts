import 'server-only';
export type FrozenUpload={sourceKey:string;key:string;sha256:string;size:number};
export function immutableUploadKey(_source:string):string {throw new Error('Upload finalization unavailable.');}
export function isImmutableUploadKey(_key:unknown):boolean {return false;}
export async function finalizeUpload(_source:string,_size:number,_mime:string):Promise<FrozenUpload>{throw new Error('Upload finalization unavailable.');}
export async function verifyImmutableUpload(_key:string,_size:number):Promise<void>{throw new Error('Upload finalization unavailable.');}
