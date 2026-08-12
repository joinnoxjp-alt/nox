(function initializeJobDuplicate(globalObject) {
  const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\u3000・･\-‐‑–—―()（）［］【】「」『』\/\\]/g, "").replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  const nameKeys = (value) => [...new Set([normalize(value), ...String(value ?? "").normalize("NFKC").split(/[\/／()（）「」『』]/).map(normalize).filter(Boolean)])];
  const same = (a, b) => Boolean(normalize(a) && normalize(a) === normalize(b));
  const namesOverlap = (a, b) => nameKeys(a).some((key) => new Set(nameKeys(b)).has(key));
  function find(candidate, jobs) {
    let addressCandidate = null;
    for (const job of jobs || []) {
      const nameArea = namesOverlap(candidate.storeName, job.storeName) && same(candidate.area, job.area);
      const address = same(candidate.address, job.address);
      if (!nameArea && !address) continue;
      const reasons = [nameArea ? "店舗名＋エリア一致" : "", address ? "住所一致" : "", same(candidate.station, job.station) ? "最寄り駅一致" : "", same(candidate.businessType, job.businessType) ? "業種一致" : ""].filter(Boolean);
      if (["paused", "archived", "rejected"].includes(String(job.status || ""))) return { level: "past", job, reasons };
      if (nameArea && address) return { level: "confirmed", job, reasons };
      if (nameArea) return { level: "possible", job, reasons };
      addressCandidate = { level: "possible", job, reasons };
    }
    return addressCandidate;
  }
  globalObject.NoxJobDuplicate = { normalize, nameKeys, find };
  if (typeof module !== "undefined" && module.exports) module.exports = { normalize, nameKeys, find };
})(typeof window !== "undefined" ? window : globalThis);
