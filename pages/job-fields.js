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
      requirements: first(data, ["requirements", "qualification", "conditions"]),
      benefits: first(data, ["benefits", "treatment", "features"]),
      back: first(data, ["back", "backs"]),
      dailyPay: first(data, ["dailyPay"]),
      trial: first(data, ["trial", "trialEntry"]),
      beginner: first(data, ["beginner", "welcomeBeginners"]),
      age: first(data, ["age", "hiringAge"]),
      shift: first(data, ["shift", "shiftDetails"]),
      applyUrl: first(data, ["applyUrl", "lineUrl", "contactUrl"]),
      targetGender: first(data, ["targetGender"], "female"),
      businessScope: first(data, ["businessScope"], "night"),
    };
  }

  function targetGenderLabel(value) {
    return ({ female: "女性", male: "男性", all: "男女" })[value] || "未設定";
  }

  function businessScopeLabel(value) {
    return ({ night: "夜職", general: "一般求人", both: "両方" })[value] || "未設定";
  }

  const api = Object.freeze({ first, featureLabel, normalize, targetGenderLabel, businessScopeLabel });
  globalObject.NoxJobFields = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
