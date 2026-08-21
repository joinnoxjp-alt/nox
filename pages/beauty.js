import { getBrand, getProducts, yen, mediaMarkup } from "./beauty-data.js";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const productCard = (product) => `<article class="product-card">${mediaMarkup(product.mainImage, product.name) || '<div class="product-placeholder" aria-hidden="true"></div>'}<div class="product-card-body"><span class="eyebrow">${esc(product.shortName)}</span><h3>${esc(product.name)}</h3><div class="product-meta">${esc(product.volume)}</div><p>${esc(product.description || "")}</p><div class="product-price">${yen(product.price)}</div><div class="button-row"><a class="beauty-button secondary" href="beauty-product.html?id=${encodeURIComponent(product.id)}">詳しく見る</a><a class="beauty-button" href="beauty-order.html?product=${encodeURIComponent(product.id)}">購入する</a></div></div></article>`;
const productMediaStyles = document.createElement("style");
productMediaStyles.textContent = ".step-product-image{margin:-12px -4px 18px}.step-product-image img{display:block;width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff}";
document.head.append(productMediaStyles);

function renderStepImages(products) {
  for (const product of products) {
    const step = document.querySelector(`[data-step-product="${CSS.escape(product.id)}"]`);
    const image = mediaMarkup(product.mainImage, `${product.shortName} 商品画像`);
    if (step && image) step.insertAdjacentHTML("afterbegin", `<div class="step-product-image">${image}</div>`);
  }
}

async function init() {
  const [brand, products] = await Promise.all([getBrand(), getProducts()]);
  if (brand.isPublic === false) {
    document.querySelector("main").innerHTML = '<p class="empty">現在準備中です。</p>';
    return;
  }
  document.title = "MIRÈIO（ミルアジュ）｜NOX BEAUTY";
  document.querySelector("[data-brand-description]").textContent = brand.description;
  document.querySelector("[data-brand-story]").textContent = brand.story;
  document.querySelector("[data-trust]").textContent = brand.trustText || "";
  const hero = mediaMarkup(brand.heroMedia, "MIRÈIO");
  if (hero) document.querySelector("[data-hero-media]").innerHTML = hero;
  [["storyMedia", "story"], ["stepMedia", "step"], ["trustMedia", "trust"], ["purchaseMedia", "purchase"]].forEach(([key, target]) => {
    const html = mediaMarkup(brand[key], "MIRÈIO");
    const element = document.querySelector(`[data-media="${target}"]`);
    if (html && element) { element.innerHTML = html; element.hidden = false; }
  });
  document.querySelector("[data-products]").innerHTML = products.map(productCard).join("");
  renderStepImages(products);
  document.querySelectorAll("[data-product-select]").forEach((element) => {
    element.innerHTML = products.map((product) => `<a class="choice" href="beauty-product.html?id=${encodeURIComponent(product.id)}"><span>${esc(element.dataset.productSelect)}</span><b>${esc(product.shortName)}</b></a>`).join("");
  });
  const extras = Array.isArray(brand.extraMedia) ? brand.extraMedia.filter((item) => item.isVisible !== false).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)) : [];
  const extra = document.querySelector("[data-extra-media]");
  if (extra) extra.innerHTML = extras.map((item) => `<figure class="media-frame">${mediaMarkup(item, item.caption)}${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ""}</figure>`).join("");
  const faqs = Array.isArray(brand.faqs) && brand.faqs.length ? brand.faqs : [
    { q: "単品購入できますか？", a: "はい。各商品それぞれ単品で購入できます。" },
    { q: "3点セットはありますか？", a: "はい。MIST・AMPOULE・CREAMの3点セットをご用意しています。" },
    { q: "送料は？", a: "商品代とは別途必要です。地域により送料が異なります。" },
    { q: "発送元は？", a: "MIRÈIO販売事業者より直接発送します。" },
    { q: "支払い方法は？", a: "現時点では銀行振込を予定しています。" }
  ];
  document.querySelector("[data-faq]").innerHTML = faqs.map((item) => `<details><summary>Q. ${esc(item.q)}</summary><p>A. ${esc(item.a)}</p></details>`).join("");
}

init();
import "./beauty-media-positions.js";
import "./beauty-shipping-label.js";
import "./beauty-reason-media.js";
