import { HttpsError } from "firebase-functions/v2/https";

import { AdminJobListingSource } from "./adminJobSource";

export type AdminJobInput = {
  jobId: string;
  listingSource: AdminJobListingSource; storeName: string; ownerId: string;
  title: string; businessType: string; area: string; salary: string;
  description: string; closedDay: string;
  address: string; station: string; workHours: string; requirements: string; benefits: string; back: string;
  targetGender: "female" | "male" | "all" | ""; businessScope: "night" | "general" | "both"; dailyPay: boolean | "";
  trial: boolean | ""; beginner: boolean | ""; age: string; shift: string; position: string;
  applyType: "instagram" | "line" | "x" | "tiktok" | "other";
  applyUrl: string; sourceUrl: string; sourceCheckedAt: string; adminSourceMemo: string;
  mainImage: string; mainImageStoragePath: string; imageUrls: string[]; imageStoragePaths: string[];
  topOrder: number;
};
const APPLY_TYPES = new Set(["instagram", "line", "x", "tiktok", "other"]);
const LISTING_SOURCES = new Set(["official", "public_info"]);
const TARGET_GENDERS = new Set(["female", "male", "all", ""]);
const BUSINESS_SCOPES = new Set(["night", "general", "both"]);

function invalid(message: string): HttpsError { return new HttpsError("invalid-argument", message); }
function required(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw invalid(`${label}を入力してください。`);
  const result = value.trim();
  if (result.length > max) throw invalid(`${label}が長すぎます。`);
  return result;
}
function optional(value: unknown, max: number, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw invalid(`${label}の形式が正しくありません。`);
  const result = value.trim();
  if (result.length > max) throw invalid(`${label}が長すぎます。`);
  return result;
}
function optionalUrl(value: unknown, label: string): string {
  const result = optional(value, 2000, label);
  if (!result) return "";
  try {
    const parsed = new URL(result);
    if (!(["https:", "http:"].includes(parsed.protocol))) throw new Error("protocol");
    return parsed.href;
  } catch { throw invalid(`${label}の形式が正しくありません。`); }
}
function optionalBoolean(value: unknown, label: string): boolean | "" {
  const result = value === "" || value === undefined ? "" : value;
  if (result !== "" && typeof result !== "boolean") throw invalid(`${label}の形式が正しくありません。`);
  return result;
}
function stringList(value: unknown, maxItems: number, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 2000)) {
    throw invalid(`${label}の形式が正しくありません。`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function parseAdminJobInput(value: unknown): AdminJobInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid("求人入力が正しくありません。");
  const input = value as Record<string, unknown>;
  const listingSource = input.listingSource ?? "official";
  if (typeof listingSource !== "string" || !LISTING_SOURCES.has(listingSource)) throw invalid("掲載区分が正しくありません。");
  const applyType = input.applyType ?? "other";
  if (typeof applyType !== "string" || !APPLY_TYPES.has(applyType)) throw invalid("応募先SNSが正しくありません。");
  const rawSourceCheckedAt = optional(input.sourceCheckedAt, 10, "情報確認日");
  const sourceCheckedAt = rawSourceCheckedAt.replaceAll("/", "-");
  if (sourceCheckedAt && !/^\d{4}-\d{2}-\d{2}$/.test(sourceCheckedAt)) throw invalid("情報確認日の形式が正しくありません。YYYY-MM-DDで入力してください。");
  const targetGender = optional(input.targetGender, 10, "対象性別");
  if (!TARGET_GENDERS.has(targetGender)) throw invalid("対象性別が正しくありません。");
  const businessScope = optional(input.businessScope, 10, "掲載区分") || "night";
  if (!BUSINESS_SCOPES.has(businessScope)) throw invalid("掲載区分が正しくありません。");
  const dailyPay = optionalBoolean(input.dailyPay, "日払い");
  const trial = optionalBoolean(input.trial, "体験入店");
  const beginner = optionalBoolean(input.beginner, "未経験歓迎");
  const topOrder = input.topOrder === undefined ? 999 : input.topOrder;
  if (typeof topOrder !== "number" || !Number.isInteger(topOrder) || topOrder < 1 || topOrder > 999999) throw invalid("表示順が正しくありません。");
  const jobId = optional(input.jobId, 20, "求人ID");
  if (jobId && !/^[A-Za-z0-9]{20}$/.test(jobId)) throw invalid("求人IDが正しくありません。");
  return {
    jobId,
    listingSource: listingSource as AdminJobListingSource,
    storeName: required(input.storeName, 120, "店舗名"),
    ownerId: listingSource === "official" ? required(input.ownerId, 128, "ownerId") : "",
    title: required(input.title, 160, "求人タイトル"),
    businessType: required(input.businessType, 120, "職種・業種"),
    area: optional(input.area, 120, "勤務地"), salary: optional(input.salary, 500, "給与"),
    description: optional(input.description, 5000, "求人内容"), closedDay: optional(input.closedDay, 200, "定休日"),
    address: optional(input.address, 500, "勤務地住所"), station: optional(input.station, 200, "最寄り駅"),
    workHours: optional(input.workHours, 500, "勤務時間"), requirements: optional(input.requirements, 5000, "応募条件"),
    benefits: optional(input.benefits, 5000, "待遇"), back: optional(input.back, 1000, "各種バック"),
    targetGender: targetGender as AdminJobInput["targetGender"], businessScope: businessScope as AdminJobInput["businessScope"], dailyPay, trial, beginner,
    age: optional(input.age, 200, "採用年齢"), shift: optional(input.shift, 1000, "シフト"),
    position: optional(input.position, 120, "募集職種") || "キャスト",
    applyType: applyType as AdminJobInput["applyType"],
    applyUrl: optionalUrl(input.applyUrl, "応募先URL"), sourceUrl: optionalUrl(input.sourceUrl, "情報元URL"),
    sourceCheckedAt, adminSourceMemo: optional(input.adminSourceMemo, 2000, "管理メモ"),
    mainImage: optionalUrl(input.mainImage, "求人メイン画像"),
    mainImageStoragePath: optional(input.mainImageStoragePath, 1000, "求人メイン画像保存先"),
    imageUrls: stringList(input.imageUrls, 10, "求人詳細画像").map((url) => optionalUrl(url, "求人詳細画像")),
    imageStoragePaths: stringList(input.imageStoragePaths, 10, "求人詳細画像保存先"),
    topOrder,
  };
}
