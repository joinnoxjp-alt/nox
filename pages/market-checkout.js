import { db } from "./firebase-db.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHtml, safeImageUrl, yen } from "./market-data.js";
import { marketPayment } from "./market-payment.js";
const root = document.querySelector("[data-checkout]"), id = new URLSearchParams(location.search).get("id");
try {
  if (!id) throw new Error("not-found");
  const snapshot = await getDoc(doc(db, "marketProducts", id)), item = snapshot.data();
  if (!snapshot.exists() || item.isPublic !== true) throw new Error("not-found");
  const sold = item.soldOut === true || Number(item.stock) < 1, image = safeImageUrl(item.images?.[0]?.url);
  root.innerHTML = `<div class="detail-layout"><div class="detail-main-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}">` : '<span class="image-placeholder">NOX MARKET</span>'}</div><div class="detail-copy"><p class="eyebrow">ORDER SUMMARY</p><h2>${escapeHtml(item.name)}</h2><p class="detail-price">${yen(item.price)}</p><p>数量 1点</p><div class="market-notice"><strong>オンライン決済準備中</strong>商品ページと購入導線はご利用いただけますが、現在決済は確定されません。決済接続後、この画面から安全な決済ページへ移動できるようになります。</div><button class="market-button" data-pay disabled>${sold ? "SOLD OUT" : marketPayment.isAvailable ? "決済へ進む" : "決済準備中"}</button><p><a href="market-product.html?id=${encodeURIComponent(snapshot.id)}">商品詳細へ戻る</a></p></div></div>`;
  root.querySelector("[data-pay]")?.addEventListener("click", async () => { await marketPayment.beginCheckout({ productId: snapshot.id, quantity: 1 }); });
} catch (error) { console.error(error); root.innerHTML = '<p class="market-empty">購入対象の商品を確認できませんでした。<br><a href="market.html">商品一覧へ戻る</a></p>'; }
