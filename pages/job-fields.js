(function initializeNoxJobFields(globalObject) {
  function first(data, keys, fallback = "") {
    for (const key of keys) {
      const value = data?.[key];
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return fallback;
  }

  function featureLabel(value, enabledLabel = "対応あり") {
    if (value === true || value === "true") return enabledLabel;
    if (value === false || value === "false") return "対応なし";
    return value !== undefined && value !== null && String(value).trim()
      ? String(value)
      : "未設定";
  }

  function normalize(data = {}) {
    const requestedApplyType = first(data, ["applyType"]);
    const explicitApplyType = ["instagram", "line", "x", "tiktok", "other"].includes(requestedApplyType)
      ? requestedApplyType
      : "";
    const inferredApplyType = data.instagramUrl || data.Instagram
      ? "instagram"
      : data.lineUrl
        ? "line"
        : data.xUrl || data.twitterUrl
          ? "x"
          : data.tiktokUrl
            ? "tiktok"
            : "other";
    return {
      storeName: first(data, ["storeName", "shopName", "name"]),
      title: first(data, ["title", "jobTitle"]),
      businessType: first(data, ["businessType", "jobType", "category", "genre", "type"]),
      position: first(data, ["position", "occupation"]),
      area: first(data, ["area", "location", "prefecture"]),
      address: first(data, ["address", "workLocation"]),
      station: first(data, ["station", "nearestStation"]),
      salary: first(data, ["salary", "salaryText", "hourlyWage"]),
      description: first(data, ["description", "jobDescription", "storeDescription", "selfPr", "pr"]),
      workHours: first(data, ["workHours", "workingHours", "businessHours"]),
      closedDay: Object.prototype.hasOwnProperty.call(data, "closedDay")
        ? String(data.closedDay ?? "").trim()
        : first(data, ["holiday", "holidays", "closedDays", "regularHoliday", "dayOff"]),
      requirements: first(data, ["requirements", "qualification", "conditions"]),
      benefits: first(data, ["benefits", "treatment", "features"]),
      back: first(data, ["back", "backs"]),
      dailyPay: first(data, ["dailyPay"]),
      trial: first(data, ["trial", "trialEntry"]),
      beginner: first(data, ["beginner", "welcomeBeginners"]),
      age: first(data, ["age", "hiringAge"]),
      shift: first(data, ["shift", "shiftDetails"]),
      applyType: explicitApplyType || inferredApplyType,
      applyUrl: first(data, ["applyUrl", "lineUrl", "instagramUrl", "Instagram", "xUrl", "twitterUrl", "tiktokUrl", "contactUrl"]),
      contactPhone: first(data, ["contactPhone"]),
      contactEmail: first(data, ["contactEmail"]),
      targetGender: first(data, ["targetGender"], "female"),
      businessScope: first(data, ["businessScope"], "night"),
      listingSource: data.listingSource === "public_info" ? "public_info" : "official",
    };
  }

  function targetGenderLabel(value) {
    return ({ female: "女性", male: "男性", all: "男女" })[value] || "未設定";
  }

  function businessScopeLabel(value) {
    return ({ night: "夜職", general: "一般求人", both: "両方" })[value] || "未設定";
  }

  function normalizeBusinessScope(value) {
    return value === "general" || value === "both" ? value : "night";
  }

  function isNightScope(value) {
    const scope = normalizeBusinessScope(value);
    return scope === "night" || scope === "both";
  }

  function isGeneralScope(value) {
    const scope = normalizeBusinessScope(value);
    return scope === "general" || scope === "both";
  }

  function applyTypeLabel(value) {
    return ({ instagram: "Instagram", line: "LINE", x: "X", tiktok: "TikTok", other: "その他" })[value] || "その他";
  }

  function listingSourceLabel(value) {
    return value === "public_info" ? "公開情報確認済" : "NOX掲載店舗";
  }

  const api = Object.freeze({
    first, featureLabel, normalize, targetGenderLabel, businessScopeLabel,
    normalizeBusinessScope, isNightScope, isGeneralScope,
    applyTypeLabel, listingSourceLabel,
  });
  globalObject.NoxJobFields = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
