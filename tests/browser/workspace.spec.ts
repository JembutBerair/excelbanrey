import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const product = {
  id,
  sku: "COFFEE-01",
  name: "Kopi Arabika 250g",
  category: "Coffee",
  cogs: 45000,
  target_margin_pct: 20,
  my_selling_price: 65000,
  image_path: null,
  notes: "",
  is_active: true,
  min_price: 60000,
  median_price: 62500,
  max_price: 65000,
  avg_price: 62500,
  cheapest_marketplace: "shopee",
  margin_pct: 25,
  change_24h: -5,
  change_7d: 3,
  listing_count: 2,
  created_at: new Date().toISOString(),
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "sb-demo-auth-token",
        JSON.stringify({
          access_token: "fixture-token",
          refresh_token: "fixture-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 36000,
          token_type: "bearer",
          user: {
            id,
            email: "seller@example.com",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      ),
    { id },
  );
  await page.route("https://demo.supabase.co/auth/v1/**", (r) =>
    r.fulfill({ json: { id, email: "seller@example.com" } }),
  );
  await page.route("**/api/**", (r) => {
    const u = new URL(r.request().url());
    let data: any = [];
    if (u.pathname.endsWith("/dashboard"))
      data = {
        products: 1,
        listings: 2,
        drops: 1,
        rises: 0,
        below: 0,
        last_run: null,
        movers: [product],
        alerts: [],
        trend: [
          { day: "2026-10-25", avg_price: 63000 },
          { day: "2026-10-26", avg_price: 60000 },
        ],
      };
    else if (u.pathname.includes("/products")) data = [product];
    else if (u.pathname.endsWith("/listings"))
      data = [
        {
          id: "22222222-2222-4222-8222-222222222222",
          product_id: id,
          marketplace: "shopee",
          url: "https://shopee.co.id/coffee",
          title: "Coffee",
          shop_name: "Coffee shop",
          match_status: "confirmed",
          last_price: 60000,
          delta_24h: -5,
          is_active: true,
          last_scraped_at: new Date().toISOString(),
          last_status: "ok",
        },
      ];
    else if (u.pathname.endsWith("/history"))
      data = [
        {
          day: "2026-10-26",
          listing_id: "22222222-2222-4222-8222-222222222222",
          marketplace: "shopee",
          price: 60000,
        },
      ];
    else if (u.pathname.endsWith("/scrape")) data = { run_id: id };
    return r.fulfill({
      json: { data, count: Array.isArray(data) ? data.length : null },
    });
  });
});
test("dashboard, catalog, details and dark mode work with API fixtures", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Kopi Arabika 250g", exact: true }),
  ).toBeVisible();
  if (process.env.CAPTURE_DASHBOARD) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => {
      const tag = document.createElement("div");
      document.querySelector("nextjs-portal")?.remove();
      tag.textContent = "DESIGN PREVIEW · DEMO DATA";
      tag.style.cssText =
        "position:fixed;top:85px;right:36px;z-index:100;background:#123f35;color:#fff;padding:7px 10px;border-radius:6px;font:11px Arial";
      document.body.appendChild(tag);
    });
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: "/tmp/priceradar-dashboard.png",
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.goto("/products");
  await expect(
    page.getByRole("link", { name: "Kopi Arabika 250g", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Kopi Arabika 250g", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kopi Arabika 250g", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your next price" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add listing" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByLabel(
      "I checked this is the same product, variant, and pack size. Confirm this match.",
    ),
  ).not.toBeChecked();
  expect(errors).toEqual([]);
});
test("spreadsheet preview validates duplicate SKUs and allows correcting rows", async ({
  page,
}) => {
  await page.goto("/products/import");
  await page.locator('input[accept=".csv,.xlsx"]').setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku,name,cogs\nA,Coffee,45000\nA,Tea,0\n"),
  });
  await expect(
    page.getByText("Duplicate SKU in this file", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "A sku", exact: true })
    .nth(1)
    .fill("B");
  await page
    .getByRole("textbox", { name: "B cogs", exact: true })
    .fill("25000");
  await expect(
    page.getByText("2 valid · 0 need fixes", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 2 products" }),
  ).toBeEnabled();
});
test("mobile catalog stays within viewport and add-product form is accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
