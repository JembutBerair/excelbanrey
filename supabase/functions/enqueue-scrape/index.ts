import {z} from 'npm:zod@4';
import {admin,checked,cors,errorText,isCron,json,userId} from '../_shared/core.ts';
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);try{
 const db=admin();if(isCron(req)){const users=await checked(db.rpc('enqueue_daily'));return json({users});}
 const id=await userId(req);if(!await checked(db.rpc('reserve_action',{p_user:id,p_action:'enqueue'})))return json({error:'Please wait a minute before queueing more scrapes.'},429);const body=z.object({listing_id:z.uuid().optional(),product_ids:z.array(z.uuid()).max(100).optional()}).parse(await req.json());const run=await checked(db.rpc('enqueue_scrape',{p_user:id,p_trigger:'manual',p_listing:body.listing_id??null,p_products:body.product_ids??null}));return json({run_id:run});
 }catch(e){return json({error:errorText(e)},errorText(e)==='unauthorized'?401:e instanceof z.ZodError?400:500);}});
