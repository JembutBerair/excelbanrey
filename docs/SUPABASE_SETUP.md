# Supabase setup — one step at a time

This guide starts with a fresh Supabase account. Finish one step and its checkpoint before continuing. Use a **new, empty project** so these migrations do not conflict with existing tables.

You need: a browser, this repository on your computer/cloud terminal, and Node.js 22 or later. Start with the free Supabase tier and mock prices. Review current plan limits before enabling production scraping.

Never send your database password, service-role key, scraper API key, or cron secret in chat. Keep them in the named settings/files below. `.env.local` and function secret files are ignored by Git.

## 1. Create your project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Choose **New project** and select/create an organization.
3. Name it **PriceRadar ID**.
4. Generate a strong database password. Store it in your password manager; you will need it when linking the CLI.
5. Choose a region close to your users, such as Singapore if offered.
6. Create the project and wait until the dashboard says it is running.

**Checkpoint:** the project dashboard opens without a provisioning message.

## 2. Connect the app using the public keys

In your project, open **Connect**, or **Project Settings → API / API Keys**. Copy:

- **Project URL**, which looks like `https://your-project-ref.supabase.co`.
- **Publishable key**, or the legacy **anon/public** key. Either is suitable for the browser client.

In a terminal, enter the repository directory, then run:

```bash
npm ci
cp .env.example .env.local
```

Open `.env.local` in your editor. Replace **only these two values**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Do not put a secret key or `service_role` key in a `NEXT_PUBLIC_` variable. Those variables are shipped to the browser. The `SUPABASE_SERVICE_ROLE_KEY` entry is optional and needed only for the local seed script later. The normal app server does not need it.

**Checkpoint:** the two values belong to the same Supabase project. Do not post them here; proceed to the database step before trying to sign in.

## 3. Create the database tables and security rules

Use the Supabase CLI from the repository terminal:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push
```

Replace `YOUR_PROJECT_REF` with the reference from **Project Settings → General** or the subdomain in your project URL. `login` opens a browser to authorize the CLI. If `link` asks for a database password, enter the password from step 1 in your terminal.

`db push` applies these three files in order:

1. `supabase/migrations/202610270001_core.sql`
2. `supabase/migrations/202610270002_queue.sql`
3. `supabase/migrations/202610270003_import_limits.sql`

**Prefer the CLI:** it records migration history. If you cannot run it, the fallback is **SQL Editor → New query**, paste and run the complete contents of each file in order, once each. Do not mix manual SQL application with `db push` without reconciling migration history first. Do not rerun the core migration after success.

**Checkpoint:** in **Database → Tables / Table Editor**, see `products`, `listings`, `price_history`, `scrape_runs`, `scrape_jobs`, and `action_limits`. The first five have owner-read policies; `action_limits` is deliberately worker-only. In **Storage**, see the public `product-images` bucket. Do not turn RLS off to solve an error.

## 4. Set up email login

1. Open **Authentication → Sign In / Providers → Email** (wording can vary).
2. Enable email/password signup.
3. Keep email confirmation enabled for a real deployment.
4. Under **Authentication → URL Configuration**, set **Site URL** to your eventual Vercel address. While developing on your own computer, use `http://localhost:3000`.
5. Add exact redirect URLs for `http://localhost:3000/dashboard` and, later, `https://YOUR-VERCEL-DOMAIN/dashboard`.
6. Before public launch, configure your own SMTP provider in Authentication settings. Supabase's default email service has development restrictions and rate limits.

**Checkpoint:** the email provider is enabled and your app's `/dashboard` address is allowed. A cloud terminal's localhost is not automatically visible in your browser; use Vercel for browser access if your workspace has no supported preview.

## 5. Create the secret that protects scheduled work

Generate a random cron secret on your own terminal:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into your password manager. Do not commit it or share it in chat.

Create a local file called `supabase/.env.functions` with:

```dotenv
SCRAPER_PROVIDER=mock
CRON_SECRET=paste-your-generated-secret-here
```

The string after `CRON_SECRET=` must be the actual secret, not the sample text. This local file is Git-ignored.

Upload the secrets:

```bash
npx supabase@latest secrets set --env-file supabase/.env.functions
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions. Do not manually replace those built-in values. Use the legacy `service_role` JWT only if you later run the optional seed script locally.

**Checkpoint:** **Edge Functions → Secrets** lists `SCRAPER_PROVIDER` and `CRON_SECRET`. The provider is `mock` for now; all prices it produces are synthetic.

## 6. Deploy the three Edge Functions

Run from the repository:

```bash
npx supabase@latest functions deploy enqueue-scrape
npx supabase@latest functions deploy scrape-batch
npx supabase@latest functions deploy search-listings
```

The repository's `supabase/config.toml` sets `verify_jwt = false` for these functions. This is intentional: authentication is enforced **inside** each function. Manual enqueue and search call `auth.getUser()` to validate the user's bearer token; scheduled work requires the separate cron secret. The batch worker is cron-secret-only. Do not remove these checks.

**Checkpoint:** all three appear in **Edge Functions** and show successful deployments. Requests without a valid user token/cron secret must not queue work. Use the app for a manual scrape after step 8; a default dashboard “Test” call without the required authentication will fail on purpose.

## 7. Enable midnight scheduling

1. In **Database → Extensions**, enable **pg_cron** and **pg_net**. Some dashboards put Cron under **Integrations → Cron**. Enable Vault (`supabase_vault`) if it is not already available.
2. Open **Vault** (use dashboard search if needed).
3. Create a secret named **`priceradar_url`**. Its value is your complete project URL, with no trailing slash: `https://your-project-ref.supabase.co`.
4. Create a secret named **`priceradar_cron_secret`**. Its value must match **exactly** the `CRON_SECRET` from step 5.
5. Open **SQL Editor**, create a new query, paste the **complete contents** of `supabase/setup/schedule.sql`, and run it.

This registers:

- `priceradar-daily`: `0 17 * * *` UTC, which is **00:00 WIB** every day.
- `priceradar-worker`: every minute while a scrape run is active. It processes pending jobs and closes completed runs.

Supabase Cron normally uses UTC; confirm this in your project's Cron settings. The app displays dates using `Asia/Jakarta`; do not change the daily expression to midnight UTC.

The scheduling file can safely be rerun: it replaces only the two PriceRadar jobs. The cron secret is read from Vault at request time and is not embedded in job text.

Check the schedules in SQL Editor:

```sql
select jobname, schedule, active
from cron.job
where jobname like 'priceradar-%';
```

**Checkpoint:** exactly two rows appear, both active, with the expressions above.

## 8. Open the app and try your first product

On your own computer:

```bash
npm run dev
```

Open the local address printed by Next.js in your own browser. In a cloud environment with no supported browser preview, deploy to Vercel using step 10 first.

1. Choose **Create an account**, enter your email and a strong password, and confirm your email.
2. Sign in and choose **Products → Add product**.
3. Enter SKU `COFFEE-001`, name `Kopi Arabika 250g`, and COGS `45000`.
4. Open the saved product and choose **Add listing**.
5. Paste a product URL from a supported marketplace. Confirm that it is the same product/variant, then check the confirmation box and save.
6. Choose **Scrape product**.
7. Wait for the next worker tick (usually 1–2 minutes), then choose **Refresh**. Retries can take longer.
8. Check **Scrape logs**. Open the run to see its jobs.

**Checkpoint:** the run completes and the product shows a price observation. With `SCRAPER_PROVIDER=mock`, this is a **synthetic test price**, not the marketplace's actual price. Keep mock mode until all plumbing works.

For import, choose **Bulk import → Excel template**, add a few rows, and upload it. For images, name the files after each SKU, e.g. `COFFEE-001.jpg`. Review errors and thumbnails before choosing **Import**. Imported marketplace URLs are considered confirmed by you. Existing SKUs update; omitted optional fields are preserved.

## 9. Optional: load demo history

Use a **separate demo account** so synthetic observations never mix with real pricing decisions. In `.env.local`, set:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your-legacy-service-role-key
SEED_USER_EMAIL=your-demo-account-email
SEED_USER_PASSWORD=your-strong-demo-password
```

Find the legacy service-role key under **API Keys → Legacy keys**. Keep it server-side and local. Then:

```bash
npm run seed
```

The script creates the demo account if needed, confirms it administratively, and upserts 20 `DEMO-*` products with 1,240 fake historical observations. Re-running replaces only those demo listings' historical observations. The 40 fictitious listings are **inactive** to prevent sending fake URLs to a real scraping provider.

**Checkpoint:** sign in as the demo account and open a demo product to see a 30-day chart. Activate demo listings only while the provider is `mock`; active-only dashboard minimums are empty while demo listings remain inactive. Delete demo products before switching that account to live tracking.

## 10. Deploy to Vercel

1. Push this repository to GitHub when you are ready.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Choose the **Next.js** preset. Keep the repository root as the root directory; build command is `npm run build`.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel Environment Variables.
5. Deploy. The normal application does **not** need the service-role key, scraper key, or cron secret in Vercel.
6. Update Supabase's Site URL and allowed `/dashboard` redirect URL to the final Vercel domain, as described in step 4.
7. Test signup, confirmation, login, password reset, one image upload, one import, and one mock scrape on the deployed domain.

**Checkpoint:** the deployed site shows the login screen instead of “Connect your Supabase project,” and the full mock workflow succeeds.

## 11. Switch to real marketplace prices

Only after the mock workflow passes:

1. Choose **ScrapingBee** or **ScraperAPI**. Confirm that your plan supports **Indonesia (`id`)** and JavaScript rendering. Check credit charges and concurrency before running your full catalog.
2. In the ignored `supabase/.env.functions`, set:

```dotenv
SCRAPER_PROVIDER=scrapingbee
SCRAPER_API_KEY=your-provider-api-key
CRON_SECRET=keep-your-existing-cron-secret
```

Use `scraperapi` instead of `scrapingbee` if you chose ScraperAPI. Keep the same cron secret; if you rotate it, update Vault too.

3. Run `npx supabase@latest secrets set --env-file supabase/.env.functions` again. Redeploy the functions if required by your platform's secret propagation behavior.
4. Delete demo data, add one real listing, and scrape it manually.
5. Compare the logged price against the same product variant and pack size in your browser. Test each marketplace you intend to use before enabling a large run.

**Checkpoint:** the observed price is verified against the real listing. `blocked`, `parse_failed`, `not_found`, and `timeout` are surfaced failures. They are not successful tracking. Marketplace access and page structure change; this repository cannot guarantee every marketplace will permit or expose a price through your chosen provider. Mock fallback is never silently substituted in live mode.

## If something goes wrong

| What you see | What to check |
| --- | --- |
| “Connect your Supabase project” | Fill the two public variables, ensure they are not sample values, restart Next.js/redeploy Vercel. |
| “Invalid API key” or login fails | Project URL and publishable/anon key must belong to the same project. Confirm the email and email provider settings. |
| No confirmation email | Check spam, Auth email delivery logs, SMTP setup, and development email restrictions. |
| “relation does not exist” / missing RPC | Apply all three migration files, in order. Never disable RLS as a workaround. |
| Image upload denied | User must be signed in; bucket must be `product-images`; file must be JPG/PNG/WebP under 5 MB. |
| Image URL cannot download | Host may block browser CORS. Upload the image directly or in a SKU-named ZIP. |
| Scrape run stays pending | Confirm worker cron is active; both Vault values match function secrets/project URL; check Edge Function logs and `net._http_response`. |
| Worker returns 401 | The Vault cron secret and Edge Function `CRON_SECRET` do not match, or the request lacks the correct header. |
| Run has no jobs | Product and listing must both be active, and listing match must be `confirmed`. |
| Product chart empty | There must be observations in the selected date range; scrape once, then refresh. |
| Changes / 24h percentage empty | A previous price or a baseline at least 24 hours old is needed. |
| Search unavailable in mock mode | Paste a URL, or configure a live provider. Mock mode deliberately does not invent search candidates. |
| Provider failures | Check provider quota, supported location/rendering, actual listing accessibility, and per-job error text. |

For worker delivery diagnosis, inspect only statuses and timestamps; do not copy secret-bearing request headers into chat:

```sql
select id, status_code, timed_out, created
from net._http_response
order by created desc
limit 20;
```

If you need help, share the **step number and error message**, with secrets removed. Keep RLS enabled and keep secret keys out of browser environment variables.
