type JobData = Record<string, unknown>;
const APPLY_TYPES = new Set(["instagram", "line", "x", "tiktok", "other"]);

function firstText(data: JobData, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function canonicalJobCompatibilityChanges(data: JobData): JobData {
  const storeName = firstText(data, ["storeName", "shopName", "name"]);
  const title = firstText(data, ["title", "jobTitle"]);
  const businessType = firstText(data, ["businessType", "jobType", "category", "genre", "type"]);
  const area = firstText(data, ["area", "location", "prefecture"]);
  const salary = firstText(data, ["salary", "salaryText", "hourlyWage"]);
  const description = firstText(data, ["description", "jobDescription", "storeDescription", "selfPr", "pr"]);
  const workHours = firstText(data, ["workHours", "workingHours", "businessHours"]);
  const closedDay = typeof data.closedDay === "string"
    ? data.closedDay.trim()
    : firstText(data, ["holiday", "holidays", "closedDays", "regularHoliday", "dayOff"]);
  const requirements = firstText(data, ["requirements", "qualification", "conditions"]);
  const benefits = firstText(data, ["benefits", "treatment", "features"]);
  const requestedApplyType = firstText(data, ["applyType"]);
  const explicitApplyType = APPLY_TYPES.has(requestedApplyType) ? requestedApplyType : "";
  const applyType = explicitApplyType ||
    (firstText(data, ["instagramUrl", "Instagram"]) ? "instagram" :
      firstText(data, ["lineUrl"]) ? "line" :
        firstText(data, ["xUrl", "twitterUrl"]) ? "x" :
          firstText(data, ["tiktokUrl"]) ? "tiktok" : "other");
  const applyUrl = firstText(data, ["applyUrl", "lineUrl", "instagramUrl", "Instagram", "xUrl", "twitterUrl", "tiktokUrl", "contactUrl"]);
  const position = firstText(data, ["position", "occupation"]);
  const back = firstText(data, ["back", "backs"]);
  const age = firstText(data, ["age", "hiringAge"]);
  const shift = firstText(data, ["shift", "shiftDetails"]);
  const address = firstText(data, ["address", "workLocation"]);
  const station = firstText(data, ["station", "nearestStation"]);
  const dailyPay = data.dailyPay ?? "";
  const trial = data.trial ?? data.trialEntry ?? "";
  const beginner = data.beginner ?? data.welcomeBeginners ?? "";

  return {
    storeName, shopName: storeName, name: storeName,
    title, jobTitle: title,
    businessType, jobType: businessType, category: businessType,
    area, location: area,
    address, workLocation: address,
    station, nearestStation: station,
    salary, salaryText: salary,
    description, jobDescription: description, storeDescription: description,
    selfPr: description, pr: description,
    workHours, workingHours: workHours,
    closedDay,
    requirements, qualification: requirements,
    benefits, treatment: benefits,
    applyType, applyUrl, contactUrl: applyUrl,
    lineUrl: applyType === "line" ? applyUrl : firstText(data, ["lineUrl"]),
    instagramUrl: applyType === "instagram" ? applyUrl : firstText(data, ["instagramUrl", "Instagram"]),
    xUrl: applyType === "x" ? applyUrl : firstText(data, ["xUrl", "twitterUrl"]),
    tiktokUrl: applyType === "tiktok" ? applyUrl : firstText(data, ["tiktokUrl"]),
    position, occupation: position,
    back, backs: back,
    age, hiringAge: age,
    shift, shiftDetails: shift,
    dailyPay, trial, trialEntry: trial,
    beginner, welcomeBeginners: beginner,
  };
}
