create function public.upsert_products(p_items jsonb) returns setof public.products language plpgsql security invoker set search_path='' as $$
declare item jsonb;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'Import accepts up to 100 rows per chunk';end if;
 for item in select value from jsonb_array_elements(p_items) loop
 return query insert into public.products(user_id,sku,name,category,cogs,target_margin_pct,my_selling_price,image_path,notes,is_active)
 values(auth.uid(),item->>'sku',item->>'name',coalesce(item->>'category',''),(item->>'cogs')::numeric,coalesce((item->>'target_margin_pct')::numeric,20),(item->>'my_selling_price')::numeric,item->>'image_path',coalesce(item->>'notes',''),coalesce((item->>'is_active')::boolean,true))
 on conflict(user_id,sku) do update set name=excluded.name,cogs=excluded.cogs,
 category=case when item?'category' then excluded.category else products.category end,
 target_margin_pct=case when item?'target_margin_pct' then excluded.target_margin_pct else products.target_margin_pct end,
 my_selling_price=case when item?'my_selling_price' then excluded.my_selling_price else products.my_selling_price end,
 image_path=case when item?'image_path' then excluded.image_path else products.image_path end,
 notes=case when item?'notes' then excluded.notes else products.notes end,
 is_active=case when item?'is_active' then excluded.is_active else products.is_active end returning *;
 end loop;end$$;
revoke all on function public.upsert_products(jsonb) from public,anon;
grant execute on function public.upsert_products(jsonb) to authenticated;
create table public.action_limits(user_id uuid not null references auth.users on delete cascade,action text not null,window_start timestamptz not null default now(),count integer not null default 1,primary key(user_id,action));
alter table public.action_limits enable row level security;
revoke all on public.action_limits from anon,authenticated;
create function public.reserve_action(p_user uuid,p_action text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;max_n integer;begin
 max_n=case when p_action='search' then 10 else 5 end;
 insert into public.action_limits as a(user_id,action) values(p_user,p_action)
 on conflict(user_id,action) do update set count=case when a.window_start<now()-interval '1 minute' then 1 else a.count+1 end,window_start=case when a.window_start<now()-interval '1 minute' then now() else a.window_start end returning count into n;
 return n<=max_n;end$$;
revoke all on function public.reserve_action(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_action(uuid,text) to service_role;
create view public.listing_summary with(security_invoker=true) as
select l.*,h.price previous_price,round((l.last_price-h.price)/nullif(h.price,0)*100,2) delta_24h
from public.listings l left join lateral(select price from public.price_history where listing_id=l.id and scraped_at<=now()-interval '24 hours' order by scraped_at desc limit 1)h on true;
grant select on public.listing_summary to authenticated;
create function public.enqueue_daily() returns integer language plpgsql security definer set search_path='' as $$declare u uuid;n integer:=0;begin
 for u in select distinct user_id from public.listings where is_active and match_status='confirmed' loop
 perform public.enqueue_scrape(u,'cron');n=n+1;end loop;return n;end$$;
revoke all on function public.enqueue_daily() from public,anon,authenticated;
grant execute on function public.enqueue_daily() to service_role;
