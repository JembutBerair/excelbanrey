import { z } from "zod";
export const markets = [
  "shopee",
  "tokopedia",
  "tiktokshop",
  "lazada",
  "blibli",
  "bukalapak",
] as const;
export type Market = (typeof markets)[number];
const domains: Record<Market, string[]> = {
  shopee: ["shopee.co.id"],
  tokopedia: ["tokopedia.com"],
  tiktokshop: ["tiktok.com", "shop.tiktok.com", "tokopedia.com"],
  lazada: ["lazada.co.id"],
  blibli: ["blibli.com"],
  bukalapak: ["bukalapak.com"],
};
export function detectMarket(value: string): Market {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw Error("Use an HTTPS marketplace product URL.");
  for (const m of markets)
    if (
      domains[m].some((d) => u.hostname === d || u.hostname.endsWith("." + d))
    )
      return m;
  throw Error("This marketplace domain is not supported.");
}
export const productSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  category: z.string().trim().max(100).default(""),
  cogs: z.coerce.number().positive(),
  target_margin_pct: z.coerce.number().min(0).max(99).default(20),
  my_selling_price: z.coerce.number().positive().nullable().default(null),
  image_path: z.string().max(1024).nullable().default(null),
  notes: z.string().max(5000).default(""),
  is_active: z.boolean().default(true),
});
export const listingSchema = z.object({
  product_id: z.uuid(),
  url: z.url().refine((v) => {
    try {
      detectMarket(v);
      return true;
    } catch {
      return false;
    }
  }, "Use a supported HTTPS marketplace URL"),
  shop_name: z.string().max(200).default(""),
  title: z.string().max(300).default(""),
  match_status: z
    .enum(["suggested", "confirmed", "rejected"])
    .default("suggested"),
  is_active: z.boolean().default(true),
});
export const rupiah = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(n);
export const dateTime = (s: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
export function margin(price: number, cogs: number) {
  return price > 0 ? ((price - cogs) / price) * 100 : null;
}
export function suggestedPrice(
  strategy: string,
  cogs: number,
  min: number | null,
  median: number | null,
  target: number,
  undercut: number,
) {
  if (strategy === "target") return cogs / (1 - target / 100);
  if (strategy === "median") return median;
  if (min === null) return null;
  return strategy === "undercut" ? min * (1 - undercut / 100) : min;
}
export type Product = z.infer<typeof productSchema> & {
  id: string;
  min_price: number | null;
  median_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  cheapest_marketplace: string | null;
  margin_pct: number | null;
  change_24h: number | null;
  change_7d: number | null;
  listing_count: number;
  created_at: string;
};
export type Listing = {
  id: string;
  product_id: string;
  marketplace: Market;
  url: string;
  shop_name: string;
  title: string;
  match_status: "suggested" | "confirmed" | "rejected";
  last_price: number | null;
  last_scraped_at: string | null;
  last_status: string | null;
  is_active: boolean;
  delta_24h: number | null;
};

export function productPatch(input: unknown) {
  const raw = z.record(z.string(), z.unknown()).parse(input);
  const parsed = productSchema.partial().parse(raw);
  return Object.fromEntries(
    Object.entries(parsed).filter(([k]) => Object.hasOwn(raw, k)),
  );
}
