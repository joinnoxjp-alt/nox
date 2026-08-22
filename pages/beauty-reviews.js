import { db } from "./firebase-db.js";
import { formatReviewAuthor } from "./beauty-review-author.mjs";
import { safeSourceUrl } from "./beauty-review-source.mjs";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const target = document.querySelector("[data-external-reviews]");

if (target) {
  const brandId = target.dataset.brandId || "mireio";
  const productId = target.dataset.productId || new URLSearchParams(location.search).get("id") || "";
  const snapshot = await getDocs(query(collection(db, "beautyExternalReviews"), where("isPublic", "==", true)));
  const reviews = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    .filter((review) => review.brandId === brandId && (productId ? review.productId === productId : true))
    .filter((review) => review.quote || review.summary)
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)).slice(0, 6);
  if (reviews.length) {
    target.hidden = false;
    target.innerHTML = `<span class="eyebrow">REVIEWS</span><h2 class="beauty-heading">MIRÈIOのクチコミ</h2><p class="beauty-lead">実際に公開されているMIRÈIOに関するクチコミをご紹介します。</p><div class="external-review-grid">${reviews.map((review, index) => { const author = formatReviewAuthor(review); const sourceUrl = safeSourceUrl(review.sourceUrl); return `<article class="external-review-card${index >= 3 ? " review-extra" : ""}"${index >= 3 ? " hidden" : ""}>${review.rating ? `<p class="review-rating" aria-label="元投稿の評価 ${Number(review.rating)}点">${"★".repeat(Math.max(0, Math.min(5, Math.round(Number(review.rating)))))}</p>` : ""}<blockquote>「${esc(review.summary || review.quote)}」</blockquote>${author ? `<p class="review-author">${esc(author)}</p>` : ""}<p class="review-source">${esc(review.sourcePlatform)}より${review.sourceDate ? `・${esc(review.sourceDate)}` : ""}</p>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">投稿を見る<span aria-hidden="true"> →</span></a>` : ""}</article>`; }).join("")}</div>${reviews.length > 3 ? '<button class="beauty-button secondary review-more" type="button" aria-expanded="false">もっと見る</button>' : ""}`;
    const more = target.querySelector(".review-more");
    more?.addEventListener("click", () => {
      const expanded = more.getAttribute("aria-expanded") === "true";
      target.querySelectorAll(".review-extra").forEach((card) => { card.hidden = expanded; });
      more.setAttribute("aria-expanded", String(!expanded));
      more.textContent = expanded ? "もっと見る" : "閉じる";
    });
  }
}
