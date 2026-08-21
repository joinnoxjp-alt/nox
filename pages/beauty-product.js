import { getProduct, yen, mediaMarkup, safeUrl } from "./beauty-data.js";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const id = new URLSearchParams(location.search).get("id") || "mist";
const product = await getProduct(id);

if (!product) {
  document.querySelector("main").innerHTML = '<p class="empty">商品が見つかりません。</p>';
} else {
  document.title = `${product.name}｜NOX BEAUTY`;
  document.querySelector('meta[name="description"]').content = product.description || product.name;
  document.querySelector('link[rel="canonical"]').href = `https://joinnox.jp/pages/beauty-product.html?id=${encodeURIComponent(product.id)}`;
  const mainImage = safeUrl(product.mainImage?.url) ? `<img src="${esc(product.mainImage.url)}" alt="${esc(product.name)}">` : '<div class="product-placeholder" aria-hidden="true"></div>';
  const detailMedia = mediaMarkup(product.detailMedia || product.detailImages?.[0], `${product.name} 詳細`);
  const remainingMedia = [...(product.detailImages || []).slice(product.detailMedia ? 0 : 1), ...(product.videos || []), product.ingredientImage].filter(Boolean);
  const orderUrl = `beauty-order.html?product=${encodeURIComponent(product.id)}`;
  document.querySelector("[data-product-detail]").innerHTML = `
    <div class="product-intro"><div class="product-detail-media">${mainImage}</div><div class="product-detail-info"><span class="eyebrow">${esc(product.shortName)}</span><h1 class="beauty-heading">${esc(product.name)}</h1><p class="product-volume">${esc(product.volume)}</p><p class="price-large">${yen(product.price)}</p><p>${esc(product.description || "")}</p></div></div>
    ${detailMedia ? `<figure class="product-feature-media media-frame">${detailMedia}</figure>` : ""}
    <div class="product-information"><div class="accordion">
      <details open><summary>特徴</summary><p>${esc(product.features || product.description || "商品情報をご確認ください。")}</p></details>
      <details><summary>使い方</summary><p>${esc(product.usage || "商品パッケージの表示に従ってお使いください。")}</p></details>
      <details><summary>全成分</summary><p>${esc(product.ingredients || "商品パッケージをご確認ください。")}</p></details>
      <details><summary>商品情報</summary><p>内容量：${esc(product.volume)}<br>JAN：${esc(product.janCode || "—")}<br>原産国：韓国<br>日本語表示：商品パッケージをご確認ください。</p></details>
    </div>${remainingMedia.map((media) => `<div class="media-frame">${mediaMarkup(media, product.name)}</div>`).join("")}<div class="product-final-cta"><p>NOX公式パートナーブランド｜MIRÈIO（ミルアジュ）</p><a class="beauty-button" href="${orderUrl}">この商品を購入</a></div></div>`;
  document.querySelector("[data-buy]").href = orderUrl;
}

import "./beauty-shipping-label.js";
