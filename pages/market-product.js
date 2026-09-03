import { db } from "./firebase-db.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MARKET_NOTICE, escapeHtml, safeImageUrl, yen } from "./market-data.js";
import { initMarketShell } from "./market-shell.js";
initMarketShell(); document.querySelector("[data-notice]").textContent = MARKET_NOTICE;
const root = document.querySelector("[data-detail]");
const id = new URLSearchParams(location.search).get("id");
if (!id) root.innerHTML = '<p class="market-empty">商品が指定されていません。<br><a href="market.html">商品一覧へ戻る</a></p>';
else try {
  const snapshot = await getDoc(doc(db, "marketProducts", id));
  if (!snapshot.exists() || snapshot.data().isPublic !== true) throw new Error("not-found");
  const item = { id: snapshot.id, ...snapshot.data() };
  const images = (Array.isArray(item.images) ? item.images : []).map(image => safeImageUrl(image?.url)).filter(Boolean);
  const sold = item.soldOut === true || Number(item.stock) < 1;
  document.title = `${item.name} | NOX MARKET`;
  root.innerHTML = `<a href="market.html">← 商品一覧へ</a><div class="detail-layout" style="margin-top:24px"><div><div class="detail-main-image">${images[0] ? `<img data-main-image src="${escapeHtml(images[0])}" alt="${escapeHtml(item.name)}">` : '<span class="image-placeholder">NOX MARKET</span>'}</div>${images.length > 1 ? `<div class="detail-thumbs">${images.map((url, index) => `<button type="button" data-image="${escapeHtml(url)}" aria-label="商品画像${index + 1}"><img src="${escapeHtml(url)}" alt=""></button>`).join("")}</div>` : ""}</div><article class="detail-copy"><p class="eyebrow">${escapeHtml(item.category)}</p><h1>${escapeHtml(item.name)}</h1><p class="detail-price">${yen(item.price)}</p><dl class="detail-list"><div><dt>ブランド</dt><dd>${escapeHtml(item.brand || "—")}</dd></div><div><dt>商品の状態</dt><dd>${escapeHtml(item.condition || "—")}</dd></div><div><dt>サイズ</dt><dd>${escapeHtml(item.size || "—")}</dd></div><div><dt>カラー</dt><dd>${escapeHtml(item.color || "—")}</dd></div><div><dt>在庫</dt><dd>${sold ? "SOLD OUT" : `${Number(item.stock)}点`}</dd></div></dl><h2>商品説明</h2><p class="detail-description">${escapeHtml(item.description || "")}</p><h2>注意事項</h2><p class="detail-description">${escapeHtml(item.caution || "商品の状態をご確認のうえご購入ください。中古品の特性上、細かな使用感がある場合があります。")}</p><button class="market-button" data-buy ${sold ? "disabled" : ""}>${sold ? "SOLD OUT" : "購入手続きへ"}</button><p class="form-message" data-buy-message></p></article></div>`;
  root.querySelectorAll("[data-image]").forEach(button => button.addEventListener("click", () => { root.querySelector("[data-main-image]").src = button.dataset.image; }));
  root.querySelector("[data-buy]")?.addEventListener("click", () => { location.href = `market-checkout.html?id=${encodeURIComponent(item.id)}`; });
} catch (error) { console.error(error); root.innerHTML = '<p class="market-empty">商品が見つからないか、現在非公開です。<br><a href="market.html">商品一覧へ戻る</a></p>'; }
