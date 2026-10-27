import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  productSchema,
  productPatch,
  listingSchema,
  detectMarket,
} from "@/lib/domain";
export const dynamic = "force-dynamic";
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 503 },
      );
    const token = req.headers.get("authorization");
    if (!token?.startsWith("Bearer "))
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const db = createClient(url, key, {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token.slice(7));
    if (authError || !user)
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    const [resource, id] = (await params).path;
    const method = req.method;
    const q = req.nextUrl.searchParams;
    z.object({
      search: z.string().max(200).optional(),
      market: z
        .enum([
          "",
          "shopee",
          "tokopedia",
          "tiktokshop",
          "lazada",
          "blibli",
          "bukalapak",
        ])
        .optional(),
      page: z.coerce.number().int().min(0).max(100000).optional(),
      below: z.enum(["true", "false"]).optional(),
      dropped: z.enum(["true", "false"]).optional(),
      asc: z.enum(["true", "false"]).optional(),
      sort: z
        .enum(["name", "sku", "cogs", "min_price", "change_24h", "created_at"])
        .optional(),
      days: z.coerce.number().int().min(1).max(90).optional(),
      product: z.uuid().optional(),
    }).parse(Object.fromEntries(q));
    let result: any;
    if (resource === "dashboard" && method === "GET")
      result = await db.rpc("dashboard_stats");
    else if (resource === "products" && method === "GET") {
      let query = db
        .from("product_market_summary")
        .select("*", { count: "exact" });
      const search = q.get("search");
      if (search)
        query = query.or(
          `name.ilike.%${search.replace(/[,%().]/g, "")}%,sku.ilike.%${search.replace(/[,%().]/g, "")}%`,
        );
      if (id) query = query.eq("id", z.uuid().parse(id));
      if (q.get("below") === "true") query = query.lt("margin_pct", 0);
      if (q.get("dropped") === "true") query = query.lt("change_24h", 0);
      if (q.get("market"))
        query = query.contains("marketplaces", [q.get("market")]);
      const sort = z
        .enum(["name", "sku", "cogs", "min_price", "change_24h", "created_at"])
        .catch("created_at")
        .parse(q.get("sort"));
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .catch(0)
        .parse(q.get("page") || 0);
      result = await query
        .order(sort, { ascending: q.get("asc") === "true", nullsFirst: false })
        .range(page * 50, page * 50 + 49);
    } else if (resource === "products" && method === "POST") {
      const body = await req.json();
      const raw = Array.isArray(body) ? body : [body];
      const items = z.array(productSchema).min(1).max(100).parse(raw);
      const sparse = items.map((p, i) =>
        Object.fromEntries(
          Object.entries(p).filter(
            ([k]) =>
              ["sku", "name", "cogs"].includes(k) || Object.hasOwn(raw[i], k),
          ),
        ),
      );
      result = await db.rpc("upsert_products", { p_items: sparse });
    } else if (resource === "products" && method === "PATCH") {
      const parsed = productPatch(await req.json());
      result = await db
        .from("products")
        .update(parsed)
        .eq("id", z.uuid().parse(id))
        .select();
    } else if (resource === "products" && method === "DELETE")
      result = await db.from("products").delete().eq("id", z.uuid().parse(id));
    else if (resource === "listings" && method === "GET")
      result = await db
        .from("listing_summary")
        .select("*")
        .eq("product_id", z.uuid().parse(q.get("product")))
        .order("marketplace");
    else if (resource === "listings" && method === "POST") {
      const p = listingSchema.parse(await req.json());
      result = await db
        .from("listings")
        .upsert(
          { ...p, user_id: user.id, marketplace: detectMarket(p.url) },
          { onConflict: "product_id,url" },
        )
        .select();
    } else if (resource === "listings" && method === "PATCH") {
      const p = z
        .object({
          match_status: z
            .enum(["suggested", "confirmed", "rejected"])
            .optional(),
          is_active: z.boolean().optional(),
        })
        .parse(await req.json());
      result = await db
        .from("listings")
        .update(p)
        .eq("id", z.uuid().parse(id))
        .select();
    } else if (resource === "listings" && method === "DELETE")
      result = await db.from("listings").delete().eq("id", z.uuid().parse(id));
    else if (resource === "history" && method === "GET") {
      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .catch(30)
        .parse(q.get("days"));
      const product = z.uuid().parse(q.get("product"));
      const data: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const batch = await db
          .rpc("product_price_history", { p_product: product, p_days: days })
          .range(offset, offset + 999);
        if (batch.error) throw batch.error;
        data.push(...(batch.data || []));
        if ((batch.data?.length || 0) < 1000) break;
      }
      result = { data };
    } else if (resource === "changes" && method === "GET")
      result = await db
        .from("price_changes")
        .select("*")
        .order("scraped_at", { ascending: false })
        .range(
          Number(q.get("page") || 0) * 50,
          Number(q.get("page") || 0) * 50 + 49,
        );
    else if (resource === "runs" && method === "GET")
      result = id
        ? await db
            .from("scrape_jobs")
            .select("*,listings(title,url,marketplace)")
            .eq("run_id", z.uuid().parse(id))
            .order("created_at")
            .limit(500)
        : await db
            .from("scrape_runs")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(50);
    else if (resource === "scrape" && method === "POST") {
      const p = z
        .object({
          listing_id: z.uuid().optional(),
          product_ids: z.array(z.uuid()).max(100).optional(),
        })
        .parse(await req.json());
      result = await db.functions.invoke("enqueue-scrape", {
        body: p,
        headers: { Authorization: token },
      });
    } else if (resource === "search" && method === "POST") {
      const p = z
        .object({
          marketplace: z.enum([
            "shopee",
            "tokopedia",
            "tiktokshop",
            "lazada",
            "blibli",
            "bukalapak",
          ]),
          keyword: z.string().trim().min(2).max(150),
        })
        .parse(await req.json());
      result = await db.functions.invoke("search-listings", {
        body: p,
        headers: { Authorization: token },
      });
    } else return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.error?.context instanceof Response) {
      const response = result.error.context;
      const detail = await response.json().catch(() => null);
      return NextResponse.json(
        { error: detail?.error || result.error.message },
        { status: response.status },
      );
    }
    if (result.error) throw result.error;
    return NextResponse.json({
      data: result.data,
      count: result.count ?? null,
    });
  } catch (e) {
    const validation = e instanceof z.ZodError;
    const malformed = e instanceof SyntaxError;
    return NextResponse.json(
      {
        error: malformed
          ? "Invalid JSON request body"
          : validation
            ? e.issues.map((i) => i.message).join("; ")
            : e instanceof Error
              ? e.message
              : typeof e === "object" && e && "message" in e
                ? String(e.message)
                : "Request failed",
      },
      { status: validation || malformed ? 400 : 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
