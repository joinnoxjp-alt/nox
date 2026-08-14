import { HttpsError } from "firebase-functions/v2/https";

export const WORK_JOB_STATUSES = new Set(["draft", "published", "paused", "archived"]);
export const WORK_APPLY_TYPES = new Set(["line", "web", "instagram", "email", "phone", "other"]);

function invalid(message: string): never { throw new HttpsError("invalid-argument", message); }
function text(value: unknown, max: number, required = false): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") invalid("入力形式が正しくありません。");
  const result = value.trim();
  if ((required && !result) || result.length > max) invalid("入力内容を確認してください。");
  return result;
}
function url(value: unknown): string {
  const result = text(value, 2000);
  if (!result) return "";
  try { const parsed = new URL(result); if (!["http:", "https:"].includes(parsed.protocol)) invalid("URLが正しくありません。"); return parsed.href; }
  catch { return invalid("URLが正しくありません。"); }
}
function date(value: unknown): string {
  const result = text(value, 10);
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) invalid("日付が正しくありません。");
  return result;
}
function urls(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) invalid("画像は10件以内にしてください。");
  return value.map(url).filter(Boolean);
}

export function parseWorkCompany(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("企業情報が正しくありません。");
  const input = value as Record<string, unknown>;
  return {
    companyId: text(input.companyId, 40), name: text(input.name, 160, true), description: text(input.description, 5000),
    address: text(input.address, 500), phone: text(input.phone, 300), email: text(input.email, 254), websiteUrl: url(input.websiteUrl),
    lineUrl: url(input.lineUrl), instagramUrl: url(input.instagramUrl), xUrl: url(input.xUrl), tiktokUrl: url(input.tiktokUrl),
    logoUrl: url(input.logoUrl), logoStoragePath: text(input.logoStoragePath, 1000), mainImageUrl: url(input.mainImageUrl), mainImageStoragePath: text(input.mainImageStoragePath, 1000),
  };
}

export function parseWorkJob(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("求人情報が正しくありません。");
  const input = value as Record<string, unknown>;
  const status = text(input.status, 20) || "draft";
  const applyType = text(input.applyType, 20) || "other";
  if (!WORK_JOB_STATUSES.has(status) || !WORK_APPLY_TYPES.has(applyType)) invalid("公開状態または応募先種別が正しくありません。");
  const applyValue = applyType === "email" || applyType === "phone" ? text(input.applyValue, 300, true) : url(input.applyValue);
  if (applyType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applyValue)) invalid("応募先メールアドレスが正しくありません。");
  if (applyType === "phone") {
    const digits = applyValue.replace(/\D/g, "");
    if (!/^[+0-9()\-\s]+$/.test(applyValue) || digits.length < 7 || digits.length > 15) invalid("応募先電話番号が正しくありません。");
  }
  return {
    jobId: text(input.jobId, 40), companyId: text(input.companyId, 40, true), companyName: text(input.companyName, 160, true),
    title: text(input.title, 200, true), industry: text(input.industry, 120, true), occupation: text(input.occupation, 120, true),
    employmentType: text(input.employmentType, 80, true), salary: text(input.salary, 500, true), location: text(input.location, 500, true),
    station: text(input.station, 200), workHours: text(input.workHours, 1000), holidays: text(input.holidays, 1000),
    description: text(input.description, 10000, true), requirements: text(input.requirements, 5000), benefits: text(input.benefits, 5000),
    beginnerWelcome: input.beginnerWelcome === true, ageRequirement: text(input.ageRequirement, 300),
    mainImageUrl: url(input.mainImageUrl), mainImageStoragePath: text(input.mainImageStoragePath, 1000),
    logoUrl: url(input.logoUrl), logoStoragePath: text(input.logoStoragePath, 1000), imageUrls: urls(input.imageUrls),
    imageStoragePaths: Array.isArray(input.imageStoragePaths) ? input.imageStoragePaths.map((item) => text(item, 1000)).filter(Boolean).slice(0, 10) : [],
    applyType, applyValue, lineUrl: url(input.lineUrl), instagramUrl: url(input.instagramUrl), xUrl: url(input.xUrl),
    tiktokUrl: url(input.tiktokUrl), websiteUrl: url(input.websiteUrl), status,
    publishStartDate: date(input.publishStartDate), publishEndDate: date(input.publishEndDate),
    displayOrder: Number.isInteger(input.displayOrder) && Number(input.displayOrder) >= 1 ? Number(input.displayOrder) : 999,
    adminMemo: text(input.adminMemo, 3000),
  };
}
