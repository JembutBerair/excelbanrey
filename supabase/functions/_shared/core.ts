import {createClient} from 'npm:@supabase/supabase-js@2';
export const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
export const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-cron-secret','Access-Control-Allow-Methods':'POST,OPTIONS'};
export const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
export async function userId(req:Request){const token=req.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)throw Error('unauthorized');const {data,error}=await admin().auth.getUser(token);if(error||!data.user)throw Error('unauthorized');return data.user.id;}
export function isCron(req:Request){const expected=Deno.env.get('CRON_SECRET');const actual=req.headers.get('x-cron-secret');if(!expected||!actual||actual.length!==expected.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);return diff===0;}
export const domains:Record<string,string[]>={shopee:['shopee.co.id'],tokopedia:['tokopedia.com'],tiktokshop:['tiktok.com'],lazada:['lazada.co.id'],blibli:['blibli.com'],bukalapak:['bukalapak.com']};
export function marketFor(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('not_found: invalid URL');for(const [m,ds]of Object.entries(domains))if(ds.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))return m;throw Error('not_found: unsupported marketplace URL');}
export async function checked<T>(p:PromiseLike<{data:T;error:unknown}>){const {data,error}=await p;if(error)throw error;return data;}
export function errorText(e:unknown){return e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):'Unknown error';}
