import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectMarket,
  productSchema,
  productPatch,
  listingSchema,
  margin,
  suggestedPrice,
} from "../src/lib/domain";
test("marketplace detection rejects credential tricks, HTTP, ports, and lookalike domains", () => {
  assert.equal(
    detectMarket("https://www.tokopedia.com/shop/item"),
    "tokopedia",
  );
  for (const url of [
    "https://shopee.co.id.attacker.com/a",
    "http://shopee.co.id/a",
    "https://shopee.co.id@attacker.com/a",
    "https://user@shopee.co.id/a",
    "https://shopee.co.id:8443/a",
    "https://127.0.0.1/a",
  ])
    assert.throws(() => detectMarket(url));
});
test("margin is based on selling price, target strategy inverts it", () => {
  assert.equal(margin(100000, 80000), 20);
  assert.equal(suggestedPrice("target", 80000, null, null, 20, 2), 100000);
  assert.equal(suggestedPrice("undercut", 80000, 100000, null, 20, 2), 98000);
  assert.equal(suggestedPrice("min", 80000, null, null, 20, 2), null);
  assert.equal(margin(0, 100), null);
});
test("reject invalid cost, margin, missing SKU, and untrusted listing domains", () => {
  assert.equal(
    productSchema.safeParse({ sku: "A", name: "Coffee", cogs: 45000 }).success,
    true,
  );
  for (const p of [
    { sku: "", name: "A", cogs: 4 },
    { sku: "A", name: "A", cogs: 0 },
    { sku: "A", name: "A", cogs: 4, target_margin_pct: 100 },
  ])
    assert.equal(productSchema.safeParse(p).success, false);
  assert.equal(
    listingSchema.safeParse({
      product_id: crypto.randomUUID(),
      url: "https://attacker.com",
    }).success,
    false,
  );
});

test("inline edits do not reset unrelated product fields", () => {
  assert.deepEqual(productPatch({ cogs: 45000 }), { cogs: 45000 });
  assert.deepEqual(productPatch({ is_active: false }), { is_active: false });
  assert.deepEqual(productPatch({ my_selling_price: null }), {
    my_selling_price: null,
  });
});
