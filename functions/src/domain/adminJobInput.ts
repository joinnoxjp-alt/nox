import { HttpsError } from "firebase-functions/v2/https";

import { AdminJobListingSource } from "./adminJobSource";

export type AdminJobInput = {
  listingSource: AdminJobListingSource; storeName: string; ownerId: string;
  title: string; businessType: string; area: string; salary: string;
  description: string; closedDay: string;
  applyType: "instagram" | "line" | "x" | "tiktok" | "other";
  applyUrl: string; sourceUrl: string; sourceCheckedAt: string; adminSourceMemo: string;
};
const APPLY_TYPES = new Set(["instagram", "line", "x", "tiktok", "other"]);
const LISTING_SOURCES = new Set(["official", "public_info"]);

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
  return {
    listingSource: listingSource as AdminJobListingSource,
    storeName: required(input.storeName, 120, "店舗名"),
    ownerId: listingSource === "official" ? required(input.ownerId, 128, "ownerId") : "",
    title: required(input.title, 160, "求人タイトル"),
    businessType: required(input.businessType, 120, "職種・業種"),
    area: optional(input.area, 120, "勤務地"), salary: optional(input.salary, 500, "給与"),
    description: optional(input.description, 5000, "求人内容"), closedDay: optional(input.closedDay, 200, "定休日"),
    applyType: applyType as AdminJobInput["applyType"],
    applyUrl: optionalUrl(input.applyUrl, "応募先URL"), sourceUrl: optionalUrl(input.sourceUrl, "情報元URL"),
    sourceCheckedAt, adminSourceMemo: optional(input.adminSourceMemo, 2000, "管理メモ"),
  };
}
