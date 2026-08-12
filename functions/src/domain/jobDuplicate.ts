export type DuplicateJob = {
  id: string; storeName?: unknown; area?: unknown; address?: unknown; station?: unknown;
  businessType?: unknown; salary?: unknown; back?: unknown; phone?: unknown; status?: unknown; title?: unknown;
};
export type DuplicateMatch = { level: "confirmed" | "possible" | "past"; job: DuplicateJob; reasons: string[] };

export function normalizeComparable(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[\s\u3000・･\-‐‑–—―()（）［］【】「」『』\/\\]/g, "")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function nameKeys(value: unknown): string[] {
  const raw = String(value ?? "").normalize("NFKC");
  const parts = raw.split(/[\/／()（）「」『』]/).map(normalizeComparable).filter(Boolean);
  return [...new Set([normalizeComparable(raw), ...parts])];
}

function same(a: unknown, b: unknown): boolean {
  const left = normalizeComparable(a); const right = normalizeComparable(b);
  return Boolean(left && right && left === right);
}

function namesOverlap(a: unknown, b: unknown): boolean {
  const right = new Set(nameKeys(b));
  return nameKeys(a).some((key) => right.has(key));
}

export function findDuplicateJob(candidate: DuplicateJob, jobs: DuplicateJob[]): DuplicateMatch | null {
  let addressCandidate: DuplicateMatch | null = null;
  for (const job of jobs) {
    const nameArea = namesOverlap(candidate.storeName, job.storeName) && same(candidate.area, job.area);
    const address = same(candidate.address, job.address);
    if (!nameArea && !address) continue;
    const reasons = [nameArea ? "店舗名＋エリア一致" : "", address ? "住所一致" : "", same(candidate.station, job.station) ? "最寄り駅一致" : "", same(candidate.businessType, job.businessType) ? "業種一致" : ""].filter(Boolean);
    const past = ["paused", "archived", "rejected"].includes(String(job.status ?? ""));
    if (past) return { level: "past", job, reasons };
    if (nameArea && address) return { level: "confirmed", job, reasons };
    if (nameArea) return { level: "possible", job, reasons };
    addressCandidate = { level: "possible", job, reasons };
  }
  return addressCandidate;
}

export function duplicateLockIds(storeName: unknown, area: unknown): string[] {
  const normalizedArea = normalizeComparable(area);
  if (!normalizedArea) return [];
  return nameKeys(storeName).map((name) => `${name}__${normalizedArea}`).filter((id) => id.length <= 500);
}
