import { getBrands } from "./beauty-data.js";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const brands = await getBrands();
const container = document.querySelector("[data-partner-brands]");
if (container) {
  container.innerHTML = brands.map((brand) => `<article class="partner-card"><span class="partner-badge">NOX OFFICIAL PARTNER BRAND</span><h3>${esc(brand.brandName)}${brand.brandNameJa ? `（${esc(brand.brandNameJa)}）` : ""}</h3><p>${esc(brand.subCopy || brand.description || "")}</p><a class="beauty-button secondary" href="${brand.id === "mireio" ? "beauty-mireio.html" : `beauty-brands.html#${encodeURIComponent(brand.id)}`}">ブランドを見る</a></article>`).join("") || '<p class="empty">公開準備中です。</p>';
}
