export const NOX_ORIGIN = "https://joinnox.jp";
export const NOX_FALLBACK_IMAGE = `${NOX_ORIGIN}/images/ai-match.jpg`;
export const NOX_WORK_FALLBACK_IMAGE = `${NOX_ORIGIN}/images/nox-work-ogp.png`;

export interface ShareMetadata {
  title: string;
  description: string;
  image: string;
  shareUrl: string;
  destinationUrl: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function first(...values: unknown[]): string {
  return values.map(text).find(Boolean) || "";
}

function safeUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function summary(parts: unknown[], fallback: string): string {
  const result = parts.map(text).filter(Boolean).join("・") || fallback;
  return result.length <= 160 ? result : `${result.slice(0, 157).trim()}…`;
}

export function isSafePublicId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

export function isPublicJob(data: Record<string, unknown>): boolean {
  return data.status === "approved" && data.isPublic === true && data.contractListingStatus === "active";
}

export function isPublicWorkJob(data: Record<string, unknown>, today: string): boolean {
  return data.status === "published" && data.isPublic === true &&
    (!text(data.publishStartDate) || text(data.publishStartDate) <= today) &&
    (!text(data.publishEndDate) || text(data.publishEndDate) >= today);
}

export function jobMetadata(id: string, data: Record<string, unknown>, shareUrl: string): ShareMetadata {
  const storeName = first(data.storeName, data.shopName, data.name, "NOX掲載店舗");
  const jobTitle = first(data.title, data.jobTitle, data.position, "求人情報");
  const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls : Array.isArray(data.images) ? data.images : [];
  return {
    title: `${storeName}｜${jobTitle}｜NOX`,
    description: summary([
      first(data.salary, data.salaryText),
      first(data.area, data.location, data.address, data.workLocation),
      first(data.workHours, data.workingHours, data.shift, data.shiftDetails),
      first(data.description, data.jobDescription, data.storeDescription, data.selfPr),
    ], `${storeName}の求人情報をNOXでチェック。`),
    image: safeUrl(first(data.mainImage, data.imageUrl, data.image, imageUrls[0])) || NOX_FALLBACK_IMAGE,
    shareUrl,
    destinationUrl: `${NOX_ORIGIN}/pages/job-detail.html?id=${encodeURIComponent(id)}`,
  };
}

export function storeMetadata(id: string, page: Record<string, unknown>, shareUrl: string): ShareMetadata {
  const storeName = first(page.storeName, "NOX掲載店舗");
  return {
    title: `${storeName}｜NOX`,
    description: summary([page.category, first(page.address, page.station), page.description], `${storeName}の店舗情報をNOXでチェック。`),
    image: safeUrl(first(page.coverImageUrl, page.mainImageUrl)) || NOX_FALLBACK_IMAGE,
    shareUrl,
    destinationUrl: `${NOX_ORIGIN}/pages/store-detail.html?id=${encodeURIComponent(id)}`,
  };
}

export function workJobMetadata(id: string, data: Record<string, unknown>, shareUrl: string): ShareMetadata {
  const companyName = first(data.companyName, "掲載企業");
  const jobTitle = first(data.title, data.occupation, "求人情報");
  return {
    title: `${companyName}｜${jobTitle}｜NOX WORK`,
    description: summary([data.location, data.salary, data.workHours, data.description], `${companyName}の求人情報をNOX WORKでチェック。`),
    image: safeUrl(data.mainImageUrl) || NOX_WORK_FALLBACK_IMAGE,
    shareUrl,
    destinationUrl: `${NOX_ORIGIN}/day/job-detail.html?id=${encodeURIComponent(id)}`,
  };
}

export function fallbackMetadata(shareUrl: string, work = false): ShareMetadata {
  return work ? {
    title: "求人情報｜NOX WORK",
    description: "アルバイト・正社員・パートなど幅広い求人をNOX WORKで探せます。",
    image: NOX_WORK_FALLBACK_IMAGE,
    shareUrl,
    destinationUrl: `${NOX_ORIGIN}/day/`,
  } : {
    title: "全国対応の夜職求人サイト｜NOX",
    description: "全国の夜職・ナイトワーク求人や店舗情報をNOXでチェック。",
    image: NOX_FALLBACK_IMAGE,
    shareUrl,
    destinationUrl: `${NOX_ORIGIN}/`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function renderShareHtml(metadata: ShareMetadata): string {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const image = escapeHtml(metadata.image);
  const shareUrl = escapeHtml(metadata.shareUrl);
  const destinationUrl = escapeHtml(metadata.destinationUrl);
  const redirectJson = JSON.stringify(metadata.destinationUrl).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${destinationUrl}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${image}"><meta property="og:url" content="${shareUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="NOX">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}">
<meta name="robots" content="noindex,follow"><script>window.location.replace(${redirectJson});</script>
</head><body><main><p>NOXのページへ移動しています。</p><p><a href="${destinationUrl}">移動しない場合はこちら</a></p></main></body></html>`;
}
