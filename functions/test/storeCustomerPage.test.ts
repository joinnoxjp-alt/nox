import assert from "node:assert/strict";
import test from "node:test";
import { composePublicCustomerPage, isCustomerPagePublic, parseStoreCustomerPage } from "../src/domain/storeCustomerPage";

test("dedicated customer values override store fallbacks without mutation", () => {
  const store = { storeName: "既存店舗", phone: "000", coverImageUrl: "https://example.com/store.jpg" };
  const before = structuredClone(store);
  const page = composePublicCustomerPage("store_1", store, { storeName: "来店用店舗", phone: "111", coverImage: { url: "https://example.com/customer.jpg", storagePath: "customer-pages/store_1/cover/a.jpg" } }, []);
  assert.equal(page.storeName, "来店用店舗");
  assert.equal(page.phone, "111");
  assert.equal(page.coverImageUrl, "https://example.com/customer.jpg");
  assert.deepEqual(store, before);
});

test("missing customer values use existing store and gallery", () => {
  const page = composePublicCustomerPage("store_1", { storeName: "既存店舗", profileImageUrl: "https://example.com/profile.jpg" }, {}, ["https://example.com/gallery.jpg"]);
  assert.equal(page.storeName, "既存店舗");
  assert.deepEqual(page.galleryImages, ["https://example.com/gallery.jpg"]);
});

test("only enabled and published pages are public", () => {
  assert.equal(isCustomerPagePublic({ enabled: true, status: "published" }), true);
  assert.equal(isCustomerPagePublic({ enabled: true, status: "draft" }), false);
  assert.equal(isCustomerPagePublic({ enabled: false, status: "published" }), false);
});

test("input parser keeps prices and customer media separate", () => {
  const parsed = parseStoreCustomerPage({ storeId: "store_1", status: "published", enabled: true, prices: [{ label: "60分", price: "10,000円" }], mainImage: { url: "https://example.com/main.jpg", storagePath: "customer-pages/store_1/main/a.jpg" }, galleryImages: [{ url: "https://example.com/pr.jpg", storagePath: "customer-pages/store_1/gallery/b.jpg" }] });
  assert.equal(parsed.prices.length, 1);
  assert.match(parsed.mainImage?.storagePath ?? "", /^customer-pages\/store_1\/main\//);
  assert.match(parsed.galleryImages[0].storagePath, /^customer-pages\/store_1\/gallery\//);
});
