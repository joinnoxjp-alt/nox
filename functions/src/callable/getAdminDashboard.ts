import { onCall } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { adminCallableOptions } from "../config";
import { ANALYTICS_START_DATE } from "../analytics/recordAnalyticsEvent";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

type Filter = [string, FirebaseFirestore.WhereFilterOp, unknown];
type Period = "today" | "7d" | "30d" | "total";

const ANALYTICS_FIELDS = ["pv", "uu", "topPv", "jobListPv", "jobDetailPv", "storeDetailPv", "otherPv",
  "adImpressions", "adClicks", "aiStarts", "aiCompletes", "conversions", "memberRegistrations",
  "jobApplications", "storeApplications", "reviewSubmissions"] as const;

function number(value: unknown): number { return Number(value) || 0; }
export function dashboardDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function dashboardDateKeyDaysAgo(daysAgo: number, now = new Date()): string {
  return dashboardDateKey(new Date(now.getTime() - daysAgo * 86_400_000));
}
export function dashboardPeriodStart(period: Period, now = new Date()): string | undefined {
  return period === "today" ? dashboardDateKeyDaysAgo(0, now) : period === "7d" ? dashboardDateKeyDaysAgo(6, now) : period === "30d" ? dashboardDateKeyDaysAgo(29, now) : undefined;
}
export function dashboardCvr(conversions: number, uniqueUsers: number, coverageComplete: boolean) {
  return { eligible: coverageComplete && uniqueUsers > 0, value: coverageComplete && uniqueUsers > 0 ? conversions / uniqueUsers * 100 : null };
}

async function count(name: string, filters: Filter[] = []) {
  let query: FirebaseFirestore.Query = firestore.collection(name);
  for (const [field, operator, value] of filters) query = query.where(field, operator, value);
  return (await query.count().get()).data().count;
}
function startTimestamp(start?: string) { return start ? Timestamp.fromDate(new Date(`${start}T00:00:00+09:00`)) : undefined; }
function timestampDateKey(value: unknown): string | null {
  return value instanceof Timestamp ? dashboardDateKey(value.toDate()) : null;
}
function withinSourcePeriod(date: string | null, start?: string) { return Boolean(date && (!start || date >= start)); }
async function selectedDocuments(collection: string, start?: string) {
  let query: FirebaseFirestore.Query = firestore.collection(collection);
  const timestamp = startTimestamp(start);
  if (timestamp) query = query.where("createdAt", ">=", timestamp);
  return (await query.select("createdAt", "jobId", "applicantId", "userId", "uid", "email", "phone").get()).docs;
}
function applicationKey(doc: FirebaseFirestore.QueryDocumentSnapshot): string {
  const data = doc.data();
  const identity = data.applicantId || data.userId || data.uid || data.email || data.phone || "";
  return identity && data.jobId ? `${data.jobId}:${identity}` : doc.id;
}
async function jobApplicationDocuments(start?: string) {
  const [current, legacy] = await Promise.all([selectedDocuments("applications", start), selectedDocuments("jobEntries", start)]);
  const unique = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...current, ...legacy]) if (!unique.has(applicationKey(doc))) unique.set(applicationKey(doc), doc);
  return [...unique.values()];
}
async function dailyDocuments(collection: string, start: string) {
  return (await firestore.collection(collection).where("dateKey", ">=", start).get()).docs;
}

export const getAdminDashboard = onCall(adminCallableOptions, async (request) => {
  await assertActiveAdmin(request.auth);
  const requested = typeof request.data?.period === "string" ? request.data.period : "30d";
  const period: Period = (["today", "7d", "30d", "total"] as const).includes(requested as Period) ? requested as Period : "30d";
  const today = dashboardDateKey();
  const start = dashboardPeriodStart(period);
  const effectiveAnalyticsStart = !start || start < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : start;
  const graphStart = dashboardDateKeyDaysAgo(period === "7d" ? 6 : 29);
  const sourceTimestamp = startTimestamp(start);
  const sourceFilter: Filter[] = sourceTimestamp ? [["createdAt", ">=", sourceTimestamp]] : [];

  const [analyticsDocs, graphAnalyticsDocs, graphJobViewDocs, graphStoreViewDocs, periodJobViewDocs, periodStoreViewDocs,
    generalUserDocs, graphStoreApplications, graphApplications, periodApplications, adsSnapshot, periodAdDocs, graphAdDocs,
    storeApplications, totalUsers, totalJobs, publicJobs, totalStores, publicStores,
    totalReviews, pendingReviews, totalAds, enabledAds, uniqueUsers] = await Promise.all([
    dailyDocuments("analyticsDaily", effectiveAnalyticsStart), dailyDocuments("analyticsDaily", graphStart),
    dailyDocuments("jobViewStats", graphStart), dailyDocuments("storeViewStats", graphStart),
    dailyDocuments("jobViewStats", start ?? "0000-00-00"), dailyDocuments("storeViewStats", start ?? "0000-00-00"),
    firestore.collection("users").where("role", "==", "user").select("createdAt").get(),
    firestore.collection("storeApplications").where("createdAt", ">=", startTimestamp(graphStart)!).select("createdAt").get(),
    jobApplicationDocuments(graphStart), jobApplicationDocuments(start),
    firestore.collection("ads").select("title", "advertiserName", "slot", "enabled", "impressions", "clicks").get(),
    dailyDocuments("adDailyStats", effectiveAnalyticsStart), dailyDocuments("adDailyStats", graphStart),
    count("storeApplications", sourceFilter), count("users"), count("jobs"),
    count("jobs", [["status", "==", "approved"], ["isPublic", "==", true], ["contractListingStatus", "==", "active"]]),
    count("stores"), count("stores", [["isPublic", "==", true], ["contractListingStatus", "==", "active"]]),
    count("storeReviews"), count("storeReviews", [["status", "==", "pending"]]), count("ads"), count("ads", [["enabled", "==", true]]),
    count("analyticsVisitors", [["lastSeenDateKey", ">=", effectiveAnalyticsStart]])
  ]);

  const totals = Object.fromEntries(ANALYTICS_FIELDS.map((field) => [field, analyticsDocs.reduce((sum, doc) => sum + number(doc.get(field)), 0)])) as Record<(typeof ANALYTICS_FIELDS)[number], number>;
  const jobViews = periodJobViewDocs.reduce((sum, doc) => sum + number(doc.get("count")), 0);
  const storeViews = periodStoreViewDocs.reduce((sum, doc) => sum + number(doc.get("count")), 0);
  const generalUsers = generalUserDocs.size;
  const memberRegistrations = generalUserDocs.docs.filter((doc) => withinSourcePeriod(timestampDateKey(doc.get("createdAt")), start)).length;
  const jobApplications = periodApplications.length;
  const conversions = memberRegistrations + jobApplications + storeApplications;
  const coverageComplete = Boolean(start && start >= ANALYTICS_START_DATE);
  const cvr = dashboardCvr(conversions, uniqueUsers, coverageComplete);

  const currentAdIds = new Set(adsSnapshot.docs.map((doc) => doc.id));
  const periodAdTotals = periodAdDocs.reduce((result, doc) => ({ impressions: result.impressions + number(doc.get("impressions")), clicks: result.clicks + number(doc.get("clicks")) }), { impressions: 0, clicks: 0 });
  const currentAdTotals = adsSnapshot.docs.reduce((result, doc) => ({ impressions: result.impressions + number(doc.get("impressions")), clicks: result.clicks + number(doc.get("clicks")) }), { impressions: 0, clicks: 0 });
  const deletedAdHistory = period === "total" ? periodAdDocs.filter((doc) => !currentAdIds.has(String(doc.get("adId")))) : [];
  const deletedTotals = deletedAdHistory.reduce((result, doc) => ({ impressions: result.impressions + number(doc.get("impressions")), clicks: result.clicks + number(doc.get("clicks")) }), { impressions: 0, clicks: 0 });
  const adTotals = period === "total" ? { impressions: currentAdTotals.impressions + deletedTotals.impressions, clicks: currentAdTotals.clicks + deletedTotals.clicks } : periodAdTotals;
  const ads = adsSnapshot.docs.map((doc) => {
    const data = doc.data();
    const selected = period === "total" ? { impressions: number(data.impressions), clicks: number(data.clicks) } : periodAdDocs.filter((daily) => daily.get("adId") === doc.id).reduce((result, daily) => ({ impressions: result.impressions + number(daily.get("impressions")), clicks: result.clicks + number(daily.get("clicks")) }), { impressions: 0, clicks: 0 });
    return { id: doc.id, slot: data.slot ?? doc.id, name: data.title || data.advertiserName || doc.id, enabled: data.enabled === true,
      ...selected, ctr: selected.impressions ? selected.clicks / selected.impressions * 100 : 0 };
  });

  const daily = new Map<string, Record<string, number>>();
  for (let offset = period === "7d" ? 6 : 29; offset >= 0; offset--) daily.set(dashboardDateKeyDaysAgo(offset), { pv: 0, uu: 0, jobViews: 0, storeViews: 0, memberRegistrations: 0, jobApplications: 0, storeApplications: 0, impressions: 0, clicks: 0 });
  for (const doc of graphAnalyticsDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) { row.pv += number(doc.get("pv")); row.uu += number(doc.get("uu")); } }
  for (const doc of graphJobViewDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) row.jobViews += number(doc.get("count")); }
  for (const doc of graphStoreViewDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) row.storeViews += number(doc.get("count")); }
  for (const doc of generalUserDocs.docs) { const row = daily.get(timestampDateKey(doc.get("createdAt")) ?? ""); if (row) row.memberRegistrations++; }
  for (const doc of graphStoreApplications.docs) { const row = daily.get(timestampDateKey(doc.get("createdAt")) ?? ""); if (row) row.storeApplications++; }
  for (const doc of graphApplications) { const row = daily.get(timestampDateKey(doc.get("createdAt")) ?? ""); if (row) row.jobApplications++; }
  for (const doc of graphAdDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) { row.impressions += number(doc.get("impressions")); row.clicks += number(doc.get("clicks")); } }

  return {
    period, periodStart: start ?? null, periodEnd: today, measurementStartDate: ANALYTICS_START_DATE,
    trafficCoverageComplete: coverageComplete, daily: [...daily].map(([dateKey, values]) => ({ dateKey, ...values, analyticsMeasured: dateKey >= ANALYTICS_START_DATE })),
    kpis: { pv: totals.pv, uu: uniqueUsers, impressions: adTotals.impressions, clicks: adTotals.clicks,
      ctr: adTotals.impressions ? adTotals.clicks / adTotals.impressions * 100 : 0, conversions, cvr: cvr.value,
      cvrEligible: cvr.eligible, cvrDenominator: "UU", jobViews, storeViews, memberRegistrations, jobApplications, storeApplications },
    metrics: { ...totals, memberRegistrations, jobApplications, storeApplications, conversions, jobViews, storeViews,
      totalUsers, generalUsers, totalJobs, publicJobs, totalStores, publicStores, totalReviews, pendingReviews, totalAds, enabledAds },
    advertising: { total: { ...adTotals, ctr: adTotals.impressions ? adTotals.clicks / adTotals.impressions * 100 : 0 }, currentCounter: currentAdTotals,
      deletedHistory: deletedTotals, isConfirmedMinimum: period === "total" && deletedAdHistory.length > 0 },
    ads
  };
});
