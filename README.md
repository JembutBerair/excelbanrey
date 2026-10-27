# PriceRadar ID

A price intelligence workspace for Indonesian sellers, built with Next.js 15, TypeScript, Tailwind, customized shadcn/ui primitives (Radix + CVA), Supabase, and Recharts.

**Start here: [Supabase setup, one step at a time](docs/SUPABASE_SETUP.md).** You do not need a scraper subscription to start: the mock provider generates clearly identified demo observations. Real marketplace prices require a configured, paid provider and live verification.

## Run the app

Requires Node.js 22+ and npm. Use the existing checkout; a separate Git worktree is unnecessary.

```bash
npm ci
cp .env.example .env.local
# Fill the two NEXT_PUBLIC_SUPABASE_* values after following the setup guide.
npm run dev
```

Without those values, the app shows a setup screen. It does not fabricate a connected workspace. Next.js reads `.env.local` on startup; restart after changing it.

## Included workflows

- Email/password signup, login, confirmation, password reset, authenticated API routes, and per-user RLS.
- Server-paginated product catalog (50 rows/page), search, marketplace and margin filters, sorting, inline price/margin edits, bulk scrape/deactivate/delete, and full filtered CSV export.
- CSV/XLSX templates, editable import preview, duplicate and URL validation, row skipping, SKU image matching, multiple images/ZIP, browser-side image URL downloads, chunked upserts, progress, and retry of unfinished rows. An import keeps existing fields not supplied by the sheet. Import URLs are explicitly treated as user-confirmed matches.
- Product image uploads by picker, drag/drop, or clipboard; public `product-images` bucket with owner-only writes and MIME/size limits.
- Listing URL detection, keyword candidates, explicit match confirmation/rejection, enable/disable, and manual scrape actions.
- Dashboard, margin alerts, 7/30/90-day per-listing charts, COGS reference line, pricing strategies, change feed, and per-job run logs. Rupiah formatting and Jakarta dates throughout.
- Daily enqueue at 00:00 WIB and minute workers, atomic job claims with `SKIP LOCKED`, leases, three attempts, exponential retry delay, worker-only price writes, and suspicious-price flags.
- `mock`, `scrapingbee`, and `scraperapi` providers. Provider interfaces are in `supabase/functions/_shared/providers.ts`.

## Project map

```text
src/app/                       Next pages, application styles, authenticated API
src/components/                Workspace, import wizard, Radix dialog and button
src/lib/                       Shared validation, pricing rules, Supabase browser client
supabase/migrations/           Schema, ownership policies, views, queue RPCs, rate limits
supabase/functions/             Three Edge Functions and shared scraper adapters
supabase/setup/schedule.sql    Idempotent schedule registration (after Vault setup)
scripts/seed.ts                20 demo products, 40 inactive listings, 1,240 observations
tests/                         Domain, PostgreSQL integration, and browser fixture tests
docs/SUPABASE_SETUP.md         Account-to-first-scrape walkthrough
```

## Development checks

```bash
npm run typecheck
npm test
npm run check:edge
npm run test:edge
npm run build
```

`npm test` executes the SQL migrations against PGlite (real PostgreSQL compiled to WASM), with small Supabase auth/storage harnesses. It checks RLS isolation, cross-owner foreign keys, protected queue functions, field-preserving upserts, queue leases, retries, atomic history writes, and summaries. It does not replace checking your hosted Supabase deployment.

Browser smoke tests use explicit API fixtures, not a Supabase project:

```bash
npx playwright install chromium
npm run test:ui
```

If Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. The test runner starts a separate fixture-configured dev server on port 3100. Do not use its test configuration for your actual app.

## Scraper behavior and limits

Mock prices are synthetic and are not market intelligence. Mock keyword search is deliberately unavailable; paste a real marketplace URL to exercise the queue without paying for external requests. For live mode choose ScrapingBee or ScraperAPI, set the key in Supabase function secrets, and use a plan that supports Indonesian location and JavaScript rendering. Keys are never included in browser code.

Parsers try marketplace-specific embedded state paths, schema.org Product/Offer JSON-LD, and product price metadata. They refuse absent, nonpositive, and explicitly non-IDR prices. Search returns unconfirmed candidate links. Marketplace HTML, variants, logged-in pricing, and anti-bot behavior vary: live success on all six marketplaces is **not verified**. Blocked and unsupported pages surface in logs; there is no promise of universal scraping. Confirm the exact product, variant, seller, currency, and pack size before using a price. Respect marketplace terms and provider usage limits.

The worker uses three concurrent requests and claims up to 15 jobs per invocation, with 20-second fetch timeouts and random 1–3 second spacing. Check your Supabase plan's Edge Function limits and provider concurrency/cost allowances before large runs. A 5,000-row catalog is paginated in the UI; large scraping runs take multiple worker ticks and consume provider credits. Results that exceed the configured function lifetime need smaller batches or a longer-running worker platform.

Search is limited to 10 requests/user/minute; manual queue requests to 5/user/minute. A running user scrape is reused instead of duplicating it. Requests to enqueue while a run exists return that existing run; newly added listings wait for the next run. Workers re-check confirmation and activity before writing. Daily history uses one last observation per listing/day for charts; listing 24-hour deltas use the exact last observation at or before the cutoff. Missing historical baselines show no percentage. Prices are stored as timestamped observations, not guarantees of availability.

## Operational notes

- Database views are `security_invoker`; both reads and API operations use the caller's JWT. Service role is confined to workers and the optional seed script. Compound ownership foreign keys prevent attaching another user's product/listing.
- Storage images are intentionally public. Do not upload private documents. Replacing an image leaves the previous file in storage; periodically remove unreferenced files. Product deletion cascades database rows but does not delete uploaded storage objects.
- User deletion is performed through Supabase administration; do not expose admin credentials in the app. Configure production SMTP, backups, alerting, quotas, and retention for your deployment.
- Import image URLs must permit browser cross-origin downloads. If a host blocks them, upload SKU-named images/ZIP instead. URL previews are external images; do not use sensitive image URLs. Import accepts up to 5,000 rows/file, 10 MB spreadsheets, 50 MB ZIP archives, 100 MB expanded ZIP images, and 5 MB/image.
- The SheetJS 0.20.3 dependency is installed through the `@e965/xlsx` npm distribution alias because the official CDN is unavailable in this cloud environment. npm integrity is locked in `package-lock.json`. PostCSS is overridden to a patched 8.5.x release while retaining the requested Next.js 15 stack. Review this distribution choice when managing your production supply chain.
- This repository includes configuration and tests; hosted Auth, Storage, Edge Functions, cron delivery, live scraper results, and Vercel deployment require the project setup below and are not validated just by building locally.
