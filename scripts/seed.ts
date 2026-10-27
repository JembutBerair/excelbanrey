import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
  email = process.env.SEED_USER_EMAIL,
  password = process.env.SEED_USER_PASSWORD;
if (!url || !key || !email || !password)
  throw Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_EMAIL, and SEED_USER_PASSWORD in .env.local first. Use a separate demo account.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });
async function check<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return data!;
}
async function main() {
  const login = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  let userId: string;
  const signed = await login.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (signed.data.user) userId = signed.data.user.id;
  else {
    const created = await db.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true,
    });
    if (created.error)
      throw Error(
        "Demo login failed and could not create demo user: " +
          created.error.message,
      );
    userId = created.data.user.id;
  }
  const names = [
    "Kopi Arabika 250g",
    "Kopi Robusta 500g",
    "Matcha Premium 100g",
    "Tumbler Stainless 500ml",
    "Botol Minum 1L",
    "Lunch Box Bento",
    "Tas Kanvas Tote",
    "Dompet Kulit Mini",
    "Kaos Cotton Combed",
    "Hoodie Oversized",
    "Sandal Rumah",
    "Topi Baseball",
    "Serum Vitamin C",
    "Sunscreen SPF50",
    "Sabun Natural",
    "Lilin Aromaterapi",
    "Lampu Meja LED",
    "Kabel USB-C 2m",
    "Mouse Wireless",
    "Notebook A5",
  ];
  const products = await check(
    db
      .from("products")
      .upsert(
        names.map((name, i) => ({
          user_id: userId,
          sku: `DEMO-${String(i + 1).padStart(3, "0")}`,
          name,
          category:
            i < 3
              ? "Food & drink"
              : i < 8
                ? "Lifestyle"
                : i < 12
                  ? "Fashion"
                  : i < 16
                    ? "Personal care"
                    : "Accessories",
          cogs: 25000 + i * 7500,
          target_margin_pct: 20,
        })),
        { onConflict: "user_id,sku" },
      )
      .select(),
  );
  const rows = [];
  for (let i = 0; i < products!.length; i++) {
    const p = products![i];
    for (const marketplace of ["shopee", "tokopedia"]) {
      const url =
        marketplace === "shopee"
          ? `https://shopee.co.id/demo-${p.sku}-i.100.${i + 1}`
          : `https://www.tokopedia.com/priceradar-demo/${p.sku.toLowerCase()}`;
      const [l] = await check(
        db
          .from("listings")
          .upsert(
            {
              user_id: userId,
              product_id: p.id,
              marketplace,
              url,
              title: p.name,
              shop_name: "DEMO · not a real listing",
              match_status: "confirmed",
              is_active: false,
            },
            { onConflict: "product_id,url" },
          )
          .select(),
      );
      await check(db.from("price_history").delete().eq("listing_id", l.id));
      let last = 0;
      for (let d = 30; d >= 0; d--) {
        const base = Number(p.cogs) * (i % 5 === 0 ? 0.93 : 1.32);
        last =
          Math.round(
            (base *
              (1 +
                Math.sin((30 - d) / 4 + i) * 0.12 +
                (marketplace === "tokopedia" ? 0.05 : 0))) /
              100,
          ) * 100;
        rows.push({
          listing_id: l.id,
          user_id: userId,
          scraped_at: new Date(Date.now() - d * 86400000).toISOString(),
          price: last,
          in_stock: true,
        });
      }
      await check(
        db
          .from("listings")
          .update({
            last_price: last,
            last_scraped_at: new Date().toISOString(),
            last_status: "demo",
          })
          .eq("id", l.id),
      );
    }
  }
  for (let i = 0; i < rows.length; i += 500)
    await check(db.from("price_history").insert(rows.slice(i, i + 500)));
  console.log(
    "Seeded 20 demo products, 40 INACTIVE demo listings, and 1,240 observations. Enable demo listings only with SCRAPER_PROVIDER=mock; these are fictitious URLs.",
  );
  await login.auth.signOut();
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
