import { db } from "./firebase-db.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PERMISSION_ANONYMOUS = "anonymous";

export function reviewScore(review) {
  return ((Number(review.flowRating) + Number(review.supportRating)) / 2).toFixed(1);
}

function text(tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function makeComment(value, truncate) {
  const wrap = text("p", "", "review-comment");
  const comment = String(value || "");
  if (!truncate || comment.length <= 130) {
    wrap.textContent = `「${comment}」`;
    return wrap;
  }
  wrap.append(document.createTextNode(`「${comment.slice(0, 130)}…」 `));
  const more = text("button", "もっと見る", "review-more");
  more.type = "button";
  more.addEventListener("click", () => { wrap.textContent = `「${comment}」`; });
  wrap.append(more);
  return wrap;
}

export function createReviewCard(review, options = {}) {
  const anonymous = review.publishPermission === PERMISSION_ANONYMOUS;
  const card = document.createElement("article");
  card.className = "review-card";
  if (review.featured) card.append(text("span", "PICK UP", "review-pickup"));
  const store = document.createElement("div");
  store.className = "review-store";
  if (!anonymous && review.storeLogoUrl) {
    const logo = document.createElement("img");
    logo.className = "review-logo";
    logo.src = review.storeLogoUrl;
    logo.alt = "";
    logo.loading = "lazy";
    logo.referrerPolicy = "no-referrer";
    store.append(logo);
  }
  store.append(text("h3", anonymous ? "掲載店舗様" : `${review.storeName || "掲載店舗"} 様`, "review-store-name"));
  card.append(store);
  const rating = text("div", `${"★".repeat(Math.round(Number(reviewScore(review))))}${"☆".repeat(5 - Math.round(Number(reviewScore(review))))}`, "review-rating");
  rating.append(text("span", reviewScore(review), "review-score"));
  card.append(rating, makeComment(review.comment, options.truncate));
  card.append(text("p", `NOXを知ったきっかけ：${review.source}`, "review-meta"));
  card.append(text("p", `他店舗にもおすすめしたい：${review.recommendation}`, "review-meta"));
  if (review.jobUrl) {
    const link = text("a", `${anonymous ? "店舗" : review.storeName}の求人を見る`, "review-job-link");
    link.href = review.jobUrl;
    card.append(link);
  }
  return card;
}

function sortReviews(a, b) {
  if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
  const ao = Number.isInteger(a.displayOrder) ? a.displayOrder : Number.MAX_SAFE_INTEGER;
  const bo = Number.isInteger(b.displayOrder) ? b.displayOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
}

export async function loadPublicReviews(container, { limit = null, truncate = false } = {}) {
  if (!container) return;
  try {
    const [snapshot, jobsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "storeReviews"), where("status", "==", "approved"), where("isPublic", "==", true))),
      getDocs(query(collection(db, "jobs"), where("status", "==", "approved"), where("isPublic", "==", true), where("contractListingStatus", "==", "active")))
    ]);
    const jobByStore = new Map();
    jobsSnapshot.docs.forEach((jobDoc) => {
      const job = jobDoc.data();
      const storeId = job.storeId || job.ownerId;
      if (storeId && !jobByStore.has(storeId)) jobByStore.set(storeId, `/pages/job-detail.html?id=${encodeURIComponent(jobDoc.id)}`);
    });
    let reviews = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort(sortReviews);
    reviews.forEach((review) => { review.jobUrl = review.storeId ? jobByStore.get(review.storeId) || "" : ""; });
    if (Number.isInteger(limit)) reviews = reviews.slice(0, limit);
    container.replaceChildren();
    if (!reviews.length) container.append(text("p", "現在公開中の店舗様の声はありません。", "review-empty"));
    reviews.forEach((review) => container.append(createReviewCard(review, { truncate })));
  } catch (error) {
    console.error("Failed to load public store reviews", error);
    container.replaceChildren(text("p", "店舗様の声を読み込めませんでした。時間をおいて再度お試しください。", "review-error"));
  }
}

const autoContainer = document.getElementById("storeReviewGrid");
if (autoContainer) loadPublicReviews(autoContainer, { limit: autoContainer.dataset.limit ? Number(autoContainer.dataset.limit) : null, truncate: autoContainer.dataset.truncate === "true" });
