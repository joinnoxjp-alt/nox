import { HttpsError } from "firebase-functions/v2/https";

export const ADMIN_STORE_HISTORY_TYPES = [
  "invite_issued",
  "registration_completed",
] as const;

export type AdminStoreHistoryType = typeof ADMIN_STORE_HISTORY_TYPES[number];

const HISTORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function parseAdminStoreHistoryInput(value: unknown): {
  historyType: AdminStoreHistoryType;
  historyId: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "履歴削除の入力が正しくありません。");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 ||
      !ADMIN_STORE_HISTORY_TYPES.includes(input.historyType as AdminStoreHistoryType) ||
      typeof input.historyId !== "string" || !HISTORY_ID_PATTERN.test(input.historyId)) {
    throw new HttpsError("invalid-argument", "履歴削除の入力が正しくありません。");
  }
  return { historyType: input.historyType as AdminStoreHistoryType, historyId: input.historyId };
}

export function classifyAdminStoreHistory(
  data: FirebaseFirestore.DocumentData,
): AdminStoreHistoryType | null {
  if (data.registrationStatus === "completed") return "registration_completed";
  if (data.status === "approved") {
    return "invite_issued";
  }
  return null;
}
