-- First create Vault secrets named priceradar_url and priceradar_cron_secret
-- in Dashboard > Integrations > Vault. Their values are project URL and CRON_SECRET.
-- Enable pg_cron and pg_net in Database > Extensions before running this file.
do $$declare j bigint;begin
 for j in select jobid from cron.job where jobname in ('priceradar-daily','priceradar-worker') loop perform cron.unschedule(j);end loop;
end$$;
select cron.schedule('priceradar-daily','0 17 * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='priceradar_url')||'/functions/v1/enqueue-scrape',
 headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='priceradar_cron_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=10000);
$job$);
select cron.schedule('priceradar-worker','* * * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='priceradar_url')||'/functions/v1/scrape-batch',
 headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='priceradar_cron_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=150000)
 where exists(select 1 from public.scrape_runs where status='running');
$job$);
