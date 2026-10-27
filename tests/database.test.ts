import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("migrations, tenant isolation, import preservation, queue leases, retry and history atomicity", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;`);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(
        readFileSync("supabase/migrations/" + file, "utf8").replace(
          "create extension if not exists pgcrypto;",
          "",
        ),
      );
    await db.exec("grant all on all tables in schema public to service_role;");
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users values ($1),($2)", [a, b]);
    async function asUser(id: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    await asUser(a);
    const first = await db.query<any>(
      `select * from public.upsert_products($1::jsonb)`,
      [
        JSON.stringify([
          {
            sku: "A",
            name: "Coffee",
            cogs: 80000,
            target_margin_pct: 35,
            notes: "Keep this",
            image_path: a + "/photo.jpg",
          },
        ]),
      ],
    );
    const product = first.rows[0];
    await db.query(`select * from public.upsert_products($1::jsonb)`, [
      JSON.stringify([{ sku: "A", name: "Coffee updated", cogs: 85000 }]),
    ]);
    const preserved = await db.query<any>("select * from public.products");
    assert.equal(Number(preserved.rows[0].target_margin_pct), 35);
    assert.equal(preserved.rows[0].notes, "Keep this");
    assert.equal(preserved.rows[0].image_path, a + "/photo.jpg");
    const listing = (
      await db.query<any>(
        `insert into public.listings(product_id,user_id,marketplace,url,match_status) values($1,$2,'shopee','https://shopee.co.id/a','confirmed') returning id`,
        [product.id, a],
      )
    ).rows[0].id;
    await asUser(b);
    assert.equal(
      (await db.query("select * from public.products")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.product_market_summary")).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into public.listings(product_id,user_id,marketplace,url) values($1,$2,'shopee','https://shopee.co.id/b')`,
        [product.id, b],
      ),
      /foreign key/,
    );
    await assert.rejects(
      db.query(
        `insert into public.products(user_id,sku,name,cogs) values($1,'evil','evil',1)`,
        [a],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(`select public.claim_scrape_jobs(15)`),
      /permission denied/,
    );
    await db.exec("reset role;set role service_role");
    const run = (
      await db.query<any>("select public.enqueue_scrape($1) run", [a])
    ).rows[0].run;
    assert.equal(
      (await db.query<any>("select public.enqueue_scrape($1) run", [a])).rows[0]
        .run,
      run,
    );
    const job = (
      await db.query<any>("select * from public.claim_scrape_jobs(15)")
    ).rows[0];
    assert.equal(job.attempts, 1);
    assert.equal(
      (await db.query("select * from public.claim_scrape_jobs(15)")).rows
        .length,
      0,
    );
    await db.query("select public.finish_scrape_job($1,$2,$3::jsonb)", [
      job.id,
      crypto.randomUUID(),
      JSON.stringify({ price: 100000 }),
    ]);
    assert.equal(
      (await db.query("select * from public.price_history")).rows.length,
      0,
    );
    await db.query("select public.finish_scrape_job($1,$2,$3::jsonb)", [
      job.id,
      job.lock_token,
      JSON.stringify({ price: 100000, inStock: true }),
    ]);
    await db.query("select public.finish_scrape_job($1,$2,$3::jsonb)", [
      job.id,
      job.lock_token,
      JSON.stringify({ price: 100000 }),
    ]);
    assert.equal(
      (await db.query("select * from public.price_history")).rows.length,
      1,
    );
    await db.query("select public.close_scrape_runs()");
    assert.equal(
      (await db.query<any>("select * from public.scrape_runs")).rows[0].status,
      "done",
    );
    await db.query("select public.enqueue_scrape($1)", [a]);
    const retry = (
      await db.query<any>("select * from public.claim_scrape_jobs(15)")
    ).rows[0];
    await db.query("select public.finish_scrape_job($1,$2,null,$3)", [
      retry.id,
      retry.lock_token,
      "blocked: test",
    ]);
    assert.equal(
      (
        await db.query<any>("select * from public.scrape_jobs where id=$1", [
          retry.id,
        ])
      ).rows[0].status,
      "pending",
    );
    assert.equal(
      (await db.query("select * from public.claim_scrape_jobs(15)")).rows
        .length,
      0,
    );
    // Exhaust retries by advancing only this job's backoff, then verify closure.
    for (let attempt = 2; attempt <= 3; attempt++) {
      await db.query(
        "update public.scrape_jobs set next_attempt_at=now()-interval '1 second' where id=$1",
        [retry.id],
      );
      const next = (
        await db.query<any>("select * from public.claim_scrape_jobs(15)")
      ).rows[0];
      assert.equal(next.attempts, attempt);
      await db.query("select public.finish_scrape_job($1,$2,null,$3)", [
        next.id,
        next.lock_token,
        "blocked: test",
      ]);
    }
    await db.query("select public.close_scrape_runs()");
    assert.equal(
      (
        await db.query<any>(
          "select status from public.scrape_jobs where id=$1",
          [retry.id],
        )
      ).rows[0].status,
      "failed",
    );
    assert.equal(
      (
        await db.query<any>(
          "select status from public.scrape_runs where id=$1",
          [retry.run_id],
        )
      ).rows[0].status,
      "failed",
    );
    await asUser(a);
    await assert.rejects(
      db.query("update public.listings set last_price=1 where id=$1", [
        listing,
      ]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into public.price_history(listing_id,user_id,price) values($1,$2,1)",
        [listing, a],
      ),
      /permission denied/,
    );
    const stats = (await db.query<any>("select public.dashboard_stats() stats"))
      .rows[0].stats;
    assert.equal(stats.products, 1);
    assert.equal(stats.listings, 1);
    const summary = (
      await db.query<any>("select * from public.product_market_summary")
    ).rows[0];
    assert.equal(Number(summary.min_price), 100000);
    assert.equal(Number(summary.margin_pct), 15);
    await asUser(b);
    assert.equal(
      (await db.query("select * from public.price_history")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.scrape_runs")).rows.length,
      0,
    );
    assert.equal(
      (await db.query<any>("select public.dashboard_stats() stats")).rows[0]
        .stats.products,
      0,
    );
  } finally {
    await db.close();
  }
});
