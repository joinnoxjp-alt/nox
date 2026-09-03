import { db } from "./firebase-db.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MARKET_CATEGORIES, MARKET_NOTICE, escapeHtml, safeImageUrl, yen } from "./market-data.js";
import { initMarketShell } from "./market-shell.js";

initMarketShell();
document.querySelector("[data-notice]").textContent = MARKET_NOTICE;
const category = document.querySelector("[data-category]");
category.innerHTML = '<option value="">すべてのカテゴリ</option>' + MARKET_CATEGORIES.map(value => `<option>${escapeHtml(value)}</option>`).join("");
let products = [];
const millis = value => value?.toMillis?.() || new Date(value || 0).getTime() || 0;
function render() {
  const selected = category.value;
  let visible = products.filter(item => !selected || item.category === selected);
  const sort = document.querySelector("[data-sort]").value;
  visible.sort(sort === "price-asc" ? (a, b) => a.price - b.price : sort === "price-desc" ? (a, b) => b.price - a.price : (a, b) => millis(b.createdAt) - millis(a.createdAt));
  document.querySelector("[data-count]").textContent = `${visible.length} ITEMS`;
  document.querySelector("[data-products]").innerHTML = visible.length ? visible.map(item => {
    const image = safeImageUrl(item.images?.[0]?.url || item.imageUrls?.[0]);
    return `<a class="product-card" href="market-product.html?id=${encodeURIComponent(item.id)}">${item.soldOut || Number(item.stock) < 1 ? '<span class="sold-badge">SOLD OUT</span>' : ''}<div class="product-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy">` : '<span class="image-placeholder">NOX MARKET</span>'}</div><div class="product-info"><span class="product-meta">${escapeHtml(item.category)}${item.brand ? ` / ${escapeHtml(item.brand)}` : ""}</span><h3>${escapeHtml(item.name)}</h3><b class="product-price">${yen(item.price)}</b></div></a>`;
  }).join("") : products.length
    ? '<p class="market-empty">現在、条件に合う商品はありません。</p>'
    : '<p class="market-empty">現在販売中の商品はありません。<br>新しい商品が追加されるまでお待ちください。</p>';
}
category.addEventListener("change", render); document.querySelector("[data-sort]").addEventListener("change", render);
try {
  const snapshot = await getDocs(query(collection(db, "marketProducts"), where("isPublic", "==", true)));
  products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); render();
} catch (error) {
  console.error(error); document.querySelector("[data-products]").innerHTML = '<p class="market-empty">商品を読み込めませんでした。時間をおいて再度お試しください。</p>'; document.querySelector("[data-count]").textContent = "—";
}
