type JobData = Record<string, unknown>;

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
  const requirements = firstText(data, ["requirements", "qualification", "conditions"]);
  const benefits = firstText(data, ["benefits", "treatment", "features"]);
  const applyUrl = firstText(data, ["applyUrl", "lineUrl", "contactUrl"]);
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
    requirements, qualification: requirements,
    benefits, treatment: benefits,
    applyUrl, lineUrl: applyUrl, contactUrl: applyUrl,
    position, occupation: position,
    back, backs: back,
    age, hiringAge: age,
    shift, shiftDetails: shift,
    dailyPay, trial, trialEntry: trial,
    beginner, welcomeBeginners: beginner,
  };
}
