-- Service-role-only queue operations. A transaction makes each enqueue atomic.
create function public.enqueue_scrape(p_user uuid,p_trigger text default 'manual',p_listing uuid default null,p_products uuid[] default null) returns uuid language plpgsql security definer set search_path='' as $$
declare run uuid; n integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select id into run from public.scrape_runs where user_id=p_user and status='running';if run is not null then return run;end if;
 insert into public.scrape_runs(user_id,trigger) values(p_user,p_trigger) returning id into run;
 insert into public.scrape_jobs(run_id,listing_id,user_id) select run,l.id,p_user from public.listings l join public.products p on p.id=l.product_id where l.user_id=p_user and l.is_active and p.is_active and l.match_status='confirmed' and (p_listing is null or l.id=p_listing) and (p_products is null or l.product_id=any(p_products));
 get diagnostics n=row_count;update public.scrape_runs set total=n,status=case when n=0 then 'done' else 'running' end,finished_at=case when n=0 then now() end where id=run;return run;end$$;
create function public.claim_scrape_jobs(p_limit integer default 15) returns setof public.scrape_jobs language plpgsql security definer set search_path='' as $$begin
 -- Expired leases are retryable; final expired attempts fail instead of sticking forever.
 update public.scrape_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,error='timeout: worker lease expired',locked_at=null,lock_token=null where status='processing' and locked_at<now()-interval '4 minutes';
 return query with picked as (select id from public.scrape_jobs where status='pending' and next_attempt_at<=now() and attempts<3 order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),20))
 update public.scrape_jobs j set status='processing',attempts=j.attempts+1,locked_at=now(),lock_token=gen_random_uuid() from picked where j.id=picked.id returning j.*;
 end$$;
create function public.finish_scrape_job(p_job uuid,p_token uuid,p_result jsonb default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare j public.scrape_jobs; l public.listings; v_price numeric;begin
 select * into j from public.scrape_jobs where id=p_job and status='processing' and lock_token=p_token for update;if not found then return;end if;
 select * into l from public.listings where id=j.listing_id;
 if not l.is_active or l.match_status<>'confirmed' or not exists(select 1 from public.products where id=l.product_id and is_active) then
 update public.scrape_jobs set status='failed',error='not_found: listing disabled or unconfirmed',locked_at=null,lock_token=null where id=j.id;return;end if;
 v_price=(p_result->>'price')::numeric;
 if p_error is null and (v_price is null or v_price<=0) then p_error='parse_failed: invalid price';end if;
 if p_error is null then
 insert into public.price_history(listing_id,user_id,price,original_price,stock,sold_count,rating,in_stock,suspicious) values(l.id,l.user_id,v_price,(p_result->>'originalPrice')::numeric,(p_result->>'stock')::integer,(p_result->>'soldCount')::integer,(p_result->>'rating')::numeric,coalesce((p_result->>'inStock')::boolean,true),l.last_price is not null and abs(v_price-l.last_price)/l.last_price>0.5);
 update public.listings set last_price=v_price,last_scraped_at=now(),last_status=case when l.last_price is not null and abs(v_price-l.last_price)/l.last_price>0.5 then 'suspicious' else 'ok' end, title=coalesce(nullif(p_result->>'title',''),title),shop_name=coalesce(nullif(p_result->>'shopName',''),shop_name) where id=l.id;
 update public.scrape_jobs set status='done',error=null,locked_at=null,lock_token=null where id=j.id;
 else
 update public.listings set last_status=split_part(p_error,':',1) where id=l.id;
 update public.scrape_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,error=left(p_error,1500),next_attempt_at=now()+make_interval(secs=>power(2,attempts)::integer*60),locked_at=null,lock_token=null where id=j.id;
 end if;end$$;
create function public.close_scrape_runs() returns void language sql security definer set search_path='' as $$
 update public.scrape_runs r set success=s.success,failed=s.failed,status=case when s.pending>0 then 'running' when s.failed=0 then 'done' when s.success=0 then 'failed' else 'partial' end,finished_at=case when s.pending=0 then now() end
 from (select r0.id,count(j.id) filter(where j.status='done')::integer success,count(j.id) filter(where j.status='failed')::integer failed,count(j.id) filter(where j.status in ('pending','processing')) pending from public.scrape_runs r0 left join public.scrape_jobs j on j.run_id=r0.id where r0.status='running' group by r0.id)s where r.id=s.id;
$$;
revoke all on function public.enqueue_scrape(uuid,text,uuid,uuid[]),public.claim_scrape_jobs(integer),public.finish_scrape_job(uuid,uuid,jsonb,text),public.close_scrape_runs() from public,anon,authenticated;
grant execute on function public.enqueue_scrape(uuid,text,uuid,uuid[]),public.claim_scrape_jobs(integer),public.finish_scrape_job(uuid,uuid,jsonb,text),public.close_scrape_runs() to service_role;
