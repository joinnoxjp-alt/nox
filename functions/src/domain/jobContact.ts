export type ExtractedJobContact = {
  contactPhone: string;
  contactEmail: string;
  warnings: string[];
};

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const PHONE_CHARS_PATTERN = /^[+0-9()\-\s/.・,，、]+$/;

export function normalizeContactEmail(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("contactEmail must be a string.");
  const result = value.normalize("NFKC").trim().toLowerCase();
  if (result.length > 254 || !EMAIL_PATTERN.test(result)) throw new Error("contactEmail is invalid.");
  return result;
}

export function normalizeContactPhone(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("contactPhone must be a string.");
  const result = value.normalize("NFKC").replace(/^\s*(?:TEL|電話)\s*[:：]?\s*/i, "").trim();
  if (!result || result.length > 300 || !PHONE_CHARS_PATTERN.test(result)) throw new Error("contactPhone is invalid.");
  const numbers = result.split(/\s*(?:\/|・|,|，|、)\s*/).filter(Boolean);
  if (!numbers.length || numbers.some((number) => {
    const digits = number.replace(/\D/g, "");
    return digits.length < 7 || digits.length > 15;
  })) throw new Error("contactPhone is invalid.");
  return numbers.join(" / ");
}

export function extractJobContactFromAdminMemo(value: unknown): ExtractedJobContact {
  const warnings: string[] = [];
  if (typeof value !== "string" || !value.trim()) return { contactPhone: "", contactEmail: "", warnings };
  const phoneMatch = value.match(/(?:^|\n)\s*(?:TEL|電話)\s*[:：]\s*([^\r\n]+)/i);
  const emailMatch = value.match(/(?:^|\n)\s*(?:MAIL|E-?MAIL|メール)\s*[:：]\s*([^\s\r\n]+)/i);
  let contactPhone = "";
  let contactEmail = "";
  if (phoneMatch) {
    try { contactPhone = normalizeContactPhone(phoneMatch[1]); } catch { warnings.push("invalid-phone"); }
  }
  if (emailMatch) {
    try { contactEmail = normalizeContactEmail(emailMatch[1]); } catch { warnings.push("invalid-email"); }
  }
  return { contactPhone, contactEmail, warnings };
}

export function isCasablancaGroupJob(value: Record<string, unknown>): boolean {
  const evidence = [value.storeName, value.shopName, value.name, value.adminSourceMemo]
    .filter((item): item is string => typeof item === "string")
    .join("\n");
  return /カサブランカ(?:グループ)?|五十路マダム/i.test(evidence);
}
