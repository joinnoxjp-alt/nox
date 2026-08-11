import { onCall } from "firebase-functions/v2/https";
import { AggregateField, Timestamp } from "firebase-admin/firestore";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

type Filter = [string, FirebaseFirestore.WhereFilterOp, unknown];
async function count(name: string, filters: Filter[] = []) {
  let query: FirebaseFirestore.Query = firestore.collection(name);
  for (const [field, operator, value] of filters) query = query.where(field, operator, value);
  return (await query.count().get()).data().count;
}
function dateKey(daysAgo: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() - daysAgo * 86_400_000));
}
function periodStart(period: string): string | undefined {
  return period === "today" ? dateKey(0) : period === "7d" ? dateKey(6) : period === "30d" ? dateKey(29) : undefined;
}
async function analytics(start?: string) {
  let query: FirebaseFirestore.Query = firestore.collection("analyticsDaily");
  if (start) query = query.where("dateKey", ">=", start);
  const fields = ["pv", "uu", "topPv", "jobListPv", "jobDetailPv", "storeDetailPv", "adImpressions", "adClicks",
    "aiStarts", "aiCompletes", "conversions", "memberRegistrations", "jobApplications", "storeApplications", "reviewSubmissions"] as const;
  const spec: Record<string, AggregateField<number>> = {};
  for (const field of fields) spec[field] = AggregateField.sum(field);
  return (await query.aggregate(spec).get()).data() as Record<(typeof fields)[number], number>;
}
async function adPeriod(adId: string, start?: string) {
  if (!start) return null;
  const query = firestore.collection("adDailyStats").where("adId", "==", adId).where("dateKey", ">=", start);
  return (await query.aggregate({ impressions: AggregateField.sum("impressions"), clicks: AggregateField.sum("clicks") }).get()).data();
}

export const getAdminDashboard = onCall(adminCallableOptions, async (request) => {
  await assertActiveAdmin(request.auth);
  const requested = typeof request.data?.period === "string" ? request.data.period : "30d";
  const period = ["today", "7d", "30d", "total"].includes(requested) ? requested : "30d";
  const start = periodStart(period);
  const today = new Date(`${dateKey(0)}T00:00:00+09:00`);
  const week = new Date(`${dateKey(6)}T00:00:00+09:00`);
  const [totals, measurementSnapshot, uniqueUsers, totalUsers, todayUsers, sevenDayUsers, totalJobs, publicJobs, totalReviews,
    pendingReviews, totalApplications, adsSnapshot] = await Promise.all([
    analytics(start), firestore.collection("analyticsDaily").orderBy("dateKey", "asc").limit(1).select("dateKey").get(),
    count("analyticsVisitors", start ? [["lastSeenDateKey", ">=", start]] : []),
    count("users"), count("users", [["createdAt", ">=", Timestamp.fromDate(today)]]),
    count("users", [["createdAt", ">=", Timestamp.fromDate(week)]]), count("jobs"),
    count("jobs", [["isPublic", "==", true]]), count("storeReviews"),
    count("storeReviews", [["status", "==", "pending"]]), count("applications"),
    firestore.collection("ads").select("title", "advertiserName", "enabled", "impressions", "clicks").get()
  ]);
  const ads = await Promise.all(adsSnapshot.docs.map(async (doc) => {
    const data = doc.data();
    const selected = await adPeriod(doc.id, start);
    const impressions = selected ? selected.impressions : Number(data.impressions) || 0;
    const clicks = selected ? selected.clicks : Number(data.clicks) || 0;
    return { id: doc.id, name: data.title || data.advertiserName || doc.id, enabled: data.enabled === true,
      impressions, clicks, ctr: impressions ? clicks / impressions * 100 : 0 };
  }));
  const ctr = totals.adImpressions ? totals.adClicks / totals.adImpressions * 100 : 0;
  const cvr = uniqueUsers ? totals.conversions / uniqueUsers * 100 : 0;
  return {
    period, measurementStartDate: measurementSnapshot.docs[0]?.get("dateKey") ?? null,
    kpis: { pv: totals.pv, uu: uniqueUsers, impressions: totals.adImpressions, clicks: totals.adClicks,
      ctr, conversions: totals.conversions, cvr, cvrDenominator: "UU" },
    metrics: { ...totals, totalUsers, todayUsers, sevenDayUsers, totalJobs, publicJobs,
      totalReviews, pendingReviews, totalApplications },
    ads
  };
});
