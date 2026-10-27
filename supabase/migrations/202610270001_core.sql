create extension if not exists pgcrypto;
create type public.marketplace as enum ('shopee','tokopedia','tiktokshop','lazada','blibli','bukalapak');
create type public.match_status as enum ('suggested','confirmed','rejected');
create table public.products (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 sku text not null check(length(sku) between 1 and 100), name text not null check(length(name) between 1 and 300),category text not null default '',
 cogs numeric(18,2) not null check(cogs>0),target_margin_pct numeric not null default 20 check(target_margin_pct>=0 and target_margin_pct<100),
 my_selling_price numeric(18,2) check(my_selling_price>0),image_path text,notes text not null default '',is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,sku),unique(id,user_id)
);
create table public.listings (
 id uuid primary key default gen_random_uuid(), product_id uuid not null,user_id uuid not null references auth.users on delete cascade,
 marketplace public.marketplace not null,url text not null check(url~'^https://'),shop_name text not null default '',title text not null default '',
 match_status public.match_status not null default 'suggested',last_price numeric(18,2) check(last_price>0),last_scraped_at timestamptz,last_status text,is_active boolean not null default true,
 created_at timestamptz not null default now(),unique(product_id,url),unique(id,user_id),foreign key(product_id,user_id) references public.products(id,user_id) on delete cascade
);
create table public.price_history (
 id uuid primary key default gen_random_uuid(),listing_id uuid not null,user_id uuid not null references auth.users on delete cascade,
 scraped_at timestamptz not null default now(),price numeric(18,2) not null check(price>0),original_price numeric(18,2),stock integer,sold_count integer,rating numeric,in_stock boolean not null default true,suspicious boolean not null default false,
 foreign key(listing_id,user_id) references public.listings(id,user_id) on delete cascade
);
create table public.scrape_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,trigger text not null check(trigger in ('cron','manual')),
 started_at timestamptz not null default now(),finished_at timestamptz,total integer not null default 0,success integer not null default 0,failed integer not null default 0,
 status text not null default 'running' check(status in ('running','done','partial','failed')),unique(id,user_id)
);
create unique index one_running_run_per_user on public.scrape_runs(user_id) where status='running';
create table public.scrape_jobs (
 id uuid primary key default gen_random_uuid(),run_id uuid not null,listing_id uuid not null,user_id uuid not null references auth.users on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','done','failed')),attempts integer not null default 0,error text,locked_at timestamptz,lock_token uuid,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now(),
 foreign key(run_id,user_id) references public.scrape_runs(id,user_id) on delete cascade,foreign key(listing_id,user_id) references public.listings(id,user_id) on delete cascade,unique(run_id,listing_id)
);
create index on public.products(user_id,created_at desc);
create index on public.products(user_id,lower(name));
create index on public.listings(user_id,product_id);
create index on public.price_history(listing_id,scraped_at desc);
create index on public.price_history(user_id,scraped_at desc);
create index on public.scrape_runs(user_id,started_at desc);
create index on public.scrape_jobs(status,next_attempt_at) where status in ('pending','processing');
create index on public.scrape_jobs(user_id,run_id);
create function public.touch_product() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger touch_product before update on public.products for each row execute function public.touch_product();
-- Every owned relation is isolated. Only workers may write history and queue state.
do $$declare t text;begin foreach t in array array['products','listings','price_history','scrape_runs','scrape_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_select on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
 end loop;end$$;
create policy own_insert on public.products for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_update on public.products for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_delete on public.products for delete to authenticated using(user_id=(select auth.uid()));
create policy own_insert on public.listings for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_update on public.listings for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_delete on public.listings for delete to authenticated using(user_id=(select auth.uid()));
-- last_price and last_* are worker-owned; browser writes cannot forge price history.
revoke all on public.products,public.listings,public.price_history,public.scrape_runs,public.scrape_jobs from anon,authenticated;
grant select,insert,update,delete on public.products to authenticated;
grant select,delete on public.listings to authenticated;
grant insert (product_id,user_id,marketplace,url,shop_name,title,match_status,is_active) on public.listings to authenticated;
grant update (product_id,user_id,marketplace,url,shop_name,title,match_status,is_active) on public.listings to authenticated;
grant select on public.price_history,public.scrape_runs,public.scrape_jobs to authenticated;
create view public.product_market_summary with (security_invoker=true) as
select p.*, s.min_price,s.median_price,s.max_price,s.avg_price,s.cheapest_marketplace,coalesce(s.listing_count,0) listing_count,coalesce(s.marketplaces,'{}'::text[]) marketplaces,
 round((s.min_price-p.cogs)/nullif(s.min_price,0)*100,2) margin_pct,
 round((s.min_price-s.min_24h)/nullif(s.min_24h,0)*100,2) change_24h,
 round((s.min_price-s.min_7d)/nullif(s.min_7d,0)*100,2) change_7d
from public.products p left join lateral (
 select min(l.last_price) min_price,percentile_cont(0.5) within group(order by l.last_price)::numeric median_price,max(l.last_price) max_price,round(avg(l.last_price),2) avg_price,
 (array_agg(l.marketplace::text order by l.last_price nulls last) filter(where l.last_price is not null))[1] cheapest_marketplace,count(*) listing_count,array_agg(distinct l.marketplace::text) marketplaces,
 min(h24.price) min_24h,min(h7.price) min_7d
 from public.listings l
 left join lateral(select price from public.price_history h where h.listing_id=l.id and h.scraped_at<=now()-interval '24 hours' order by h.scraped_at desc limit 1) h24 on true
 left join lateral(select price from public.price_history h where h.listing_id=l.id and h.scraped_at<=now()-interval '7 days' order by h.scraped_at desc limit 1) h7 on true
 where l.product_id=p.id and l.match_status='confirmed' and l.is_active
) s on true;
create view public.price_changes with (security_invoker=true) as
select * from (select h.*,lag(h.price) over(partition by h.listing_id order by h.scraped_at,h.id) old_price,
 l.marketplace,l.product_id,p.name product_name,p.sku,
 round((h.price-lag(h.price) over(partition by h.listing_id order by h.scraped_at,h.id))/nullif(lag(h.price) over(partition by h.listing_id order by h.scraped_at,h.id),0)*100,2) change_pct
 from public.price_history h join public.listings l on l.id=h.listing_id join public.products p on p.id=l.product_id) x where old_price is not null and price<>old_price;
grant select on public.product_market_summary,public.price_changes to authenticated;
create function public.dashboard_stats() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',(select count(*) from public.products),
 'listings',(select count(*) from public.listings where match_status='confirmed' and is_active),
 'drops',(select count(*) from public.price_changes where scraped_at>=date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' and change_pct<0),
 'rises',(select count(*) from public.price_changes where scraped_at>=date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' and change_pct>0),
 'below',(select count(*) from public.product_market_summary where margin_pct<0),
 'last_run',(select to_jsonb(r) from public.scrape_runs r order by started_at desc limit 1),
 'movers',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from public.product_market_summary where change_24h is not null order by abs(change_24h) desc limit 8)m),'[]'),
 'alerts',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,name,sku,min_price,cogs,change_24h,margin_pct from public.product_market_summary where margin_pct<0 or change_24h < -10 order by change_24h limit 12)a),'[]'),
 'trend',coalesce((select jsonb_agg(to_jsonb(t)) from (select (scraped_at at time zone 'Asia/Jakarta')::date as "day",round(avg(price)) avg_price,count(*) samples from public.price_history where scraped_at>=now()-interval '14 days' group by 1 order by 1)t),'[]')
 );$$;
create function public.product_price_history(p_product uuid,p_days integer default 30) returns table("day" date,listing_id uuid,marketplace public.marketplace,price numeric) language sql stable security invoker set search_path='' as $$
 select distinct on ((h.scraped_at at time zone 'Asia/Jakarta')::date,h.listing_id) (h.scraped_at at time zone 'Asia/Jakarta')::date,h.listing_id,l.marketplace,h.price
 from public.price_history h join public.listings l on l.id=h.listing_id where l.product_id=p_product and h.scraped_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) order by 1,2,h.scraped_at desc;
$$;
revoke all on function public.dashboard_stats(),public.product_price_history(uuid,integer) from public,anon;
grant execute on function public.dashboard_stats(),public.product_price_history(uuid,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy image_read on storage.objects for select to public using(bucket_id='product-images');
create policy image_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy image_update on storage.objects for update to authenticated using(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy image_delete on storage.objects for delete to authenticated using(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
