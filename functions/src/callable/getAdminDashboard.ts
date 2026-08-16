import { onCall } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { adminCallableOptions } from "../config";
import { ANALYTICS_START_DATE } from "../analytics/recordAnalyticsEvent";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

type Filter = [string, FirebaseFirestore.WhereFilterOp, unknown];
export type DashboardPeriod = "today" | "7d" | "30d" | "month" | "previous_month" | "total" | "custom";
export type DashboardRange = { start: string; end: string; comparisonStart: string | null; comparisonEnd: string | null };
const DASHBOARD_START_DATE = "2026-07-01";
const JOB_VIEW_START_DATE = "2026-07-18";
const STORE_VIEW_START_DATE = "2026-07-26";
const STORE_CUSTOMER_START_DATE = "2026-08-16";
const TRAFFIC_SOURCE_START_DATE = "2026-08-16";
const DURABLE_VISITOR_COMPLETE_START_DATE = "2026-08-17";
const ANALYTICS_FIELDS = ["pv", "uu", "topPv", "jobListPv", "jobDetailPv", "storeDetailPv", "otherPv", "adImpressions", "adClicks", "aiStarts", "aiCompletes"] as const;

function number(value: unknown): number { return Number(value) || 0; }
export function dashboardDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function dateFromKey(key: string): Date { return new Date(`${key}T12:00:00+09:00`); }
function shiftDate(key: string, days: number): string { const value = dateFromKey(key); value.setUTCDate(value.getUTCDate() + days); return dashboardDateKey(value); }
function daysBetween(start: string, end: string): number { return Math.round((dateFromKey(end).getTime() - dateFromKey(start).getTime()) / 86_400_000) + 1; }
function monthStart(key: string): string { return `${key.slice(0, 7)}-01`; }
function previousMonthStart(key: string): string { const d = dateFromKey(monthStart(key)); d.setUTCDate(0); return monthStart(dashboardDateKey(d)); }
function monthEnd(key: string): string { const d = dateFromKey(monthStart(key)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return dashboardDateKey(d); }
function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateFromKey(value).getTime()); }
export function dashboardRange(period: DashboardPeriod, now = new Date(), customStart?: string, customEnd?: string): DashboardRange {
  const today = dashboardDateKey(now);
  let start: string; let end = today; let comparisonStart: string | null; let comparisonEnd: string | null;
  if (period === "today") start = today;
  else if (period === "7d") start = shiftDate(today, -6);
  else if (period === "30d") start = shiftDate(today, -29);
  else if (period === "month") start = monthStart(today);
  else if (period === "previous_month") { start = previousMonthStart(today); end = monthEnd(start); }
  else if (period === "custom") { start = validDate(customStart) ? customStart : DASHBOARD_START_DATE; end = validDate(customEnd) ? customEnd : today; }
  else start = DASHBOARD_START_DATE;
  if (start < DASHBOARD_START_DATE) start = DASHBOARD_START_DATE;
  if (end > today) end = today;
  if (start > end) [start, end] = [end, start];
  if (period === "month") { comparisonStart = previousMonthStart(today); comparisonEnd = shiftDate(comparisonStart, daysBetween(start, end) - 1); }
  else if (period === "previous_month") { comparisonEnd = shiftDate(start, -1); comparisonStart = monthStart(comparisonEnd); }
  else if (period === "total") { comparisonStart = null; comparisonEnd = null; }
  else { const length = daysBetween(start, end); comparisonEnd = shiftDate(start, -1); comparisonStart = shiftDate(comparisonEnd, -(length - 1)); }
  if (comparisonStart && comparisonStart < DASHBOARD_START_DATE) { comparisonStart = null; comparisonEnd = null; }
  return { start, end, comparisonStart, comparisonEnd };
}
export function dashboardPeriodStart(period: DashboardPeriod, now = new Date()): string | undefined { return period === "total" ? undefined : dashboardRange(period, now).start; }
export function dashboardCvr(conversions: number, uniqueUsers: number, coverageComplete: boolean) { return { eligible: coverageComplete && uniqueUsers > 0, value: coverageComplete && uniqueUsers > 0 ? conversions / uniqueUsers * 100 : null }; }
export function comparisonRate(current: number, previous: number, comparable = true): number | null { return comparable && previous > 0 ? (current - previous) / previous * 100 : null; }

function timestampStart(key: string) { return Timestamp.fromDate(new Date(`${key}T00:00:00+09:00`)); }
function timestampEndExclusive(key: string) { return timestampStart(shiftDate(key, 1)); }
function timestampDateKey(value: unknown): string | null { return value instanceof Timestamp ? dashboardDateKey(value.toDate()) : null; }
async function count(name: string, filters: Filter[] = []) { let query: FirebaseFirestore.Query = firestore.collection(name); for (const [field, op, value] of filters) query = query.where(field, op, value); return (await query.count().get()).data().count; }
async function dateDocuments(collection: string, start: string, end: string) { return (await firestore.collection(collection).where("dateKey", ">=", start).where("dateKey", "<=", end).get()).docs; }
async function createdDocuments(collection: string, start: string, end: string, fields: string[] = []) { let query: FirebaseFirestore.Query = firestore.collection(collection).where("createdAt", ">=", timestampStart(start)).where("createdAt", "<", timestampEndExclusive(end)); if (fields.length) query = query.select("createdAt", ...fields); return (await query.get()).docs; }
function applicationKey(doc: FirebaseFirestore.QueryDocumentSnapshot): string { const d = doc.data(); const identity = d.applicantId || d.userId || d.uid || d.email || d.phone || ""; return identity && d.jobId ? `${d.jobId}:${identity}` : doc.id; }
async function applicationDocuments(start: string, end: string) { const [current, legacy] = await Promise.all([createdDocuments("applications", start, end, ["jobId", "applicantId", "userId", "uid", "email", "phone"]), createdDocuments("jobEntries", start, end, ["jobId", "applicantId", "userId", "uid", "email", "phone"])]); const unique = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>(); for (const doc of [...current, ...legacy]) if (!unique.has(applicationKey(doc))) unique.set(applicationKey(doc), doc); return [...unique.values()]; }
function totals(docs: FirebaseFirestore.QueryDocumentSnapshot[]) { return Object.fromEntries(ANALYTICS_FIELDS.map(field => [field, docs.reduce((sum, doc) => sum + number(doc.get(field)), 0)])) as Record<(typeof ANALYTICS_FIELDS)[number], number>; }
function coverage(start: string, end: string, measurementStart: string) { return { startDate: measurementStart, complete: start >= measurementStart, measured: end >= measurementStart, label: start >= measurementStart ? "全期間取得可能" : end < measurementStart ? "計測開始前" : "一部期間のみ" }; }
function rate(numerator: number, denominator: number) { return denominator > 0 ? numerator / denominator * 100 : null; }
function rows(start: string, end: string) { const result = new Map<string, Record<string, number | null>>(); for (let day = start; day <= end; day = shiftDate(day, 1)) result.set(day, { pv: day >= ANALYTICS_START_DATE ? 0 : null, uu: day >= ANALYTICS_START_DATE ? 0 : null, cv: 0, memberRegistrations: 0, jobApplications: 0, storeApplications: 0, reviews: 0, reservations: 0, jobViews: day >= JOB_VIEW_START_DATE ? 0 : null, storeViews: day >= STORE_VIEW_START_DATE ? 0 : null, impressions: day >= ANALYTICS_START_DATE ? 0 : null, clicks: day >= ANALYTICS_START_DATE ? 0 : null }); return result; }

async function uniqueVisitors(start: string, end: string) {
  if (end < ANALYTICS_START_DATE) return null;
  const effectiveStart = start < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : start;
  // New durable anonymous visitor-day records make closed custom periods exact. Existing global visitors remain the compatibility source.
  if (end === dashboardDateKey()) return count("analyticsVisitors", [["lastSeenDateKey", ">=", effectiveStart]]);
  if (effectiveStart < DURABLE_VISITOR_COMPLETE_START_DATE) return null;
  const durable = await firestore.collection("analyticsVisitorDays").where("dateKey", ">=", effectiveStart).where("dateKey", "<=", end).select("visitorHash").get();
  return new Set(durable.docs.map(doc => String(doc.get("visitorHash") || doc.id.split("_").pop()))).size;
}

async function aggregateRange(start: string, end: string, includeRankings = true) {
  const analyticsStart = start < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : start;
  const [analyticsDocs, jobStats, storeStats, users, applications, storeApps, reviews, reservations, storeDaily, adDaily, trafficDaily, pageVisitorDocs, visitorCount] = await Promise.all([
    end >= ANALYTICS_START_DATE ? dateDocuments("analyticsDaily", analyticsStart, end) : Promise.resolve([]),
    end >= JOB_VIEW_START_DATE ? dateDocuments("jobViewStats", start < JOB_VIEW_START_DATE ? JOB_VIEW_START_DATE : start, end) : Promise.resolve([]),
    end >= STORE_VIEW_START_DATE ? dateDocuments("storeViewStats", start < STORE_VIEW_START_DATE ? STORE_VIEW_START_DATE : start, end) : Promise.resolve([]),
    createdDocuments("users", start, end, ["role"]), applicationDocuments(start, end), createdDocuments("storeApplications", start, end),
    createdDocuments("storeReviews", start, end), createdDocuments("storeReservations", start, end, ["storeId", "storeName", "jobId", "status", "source", "sourceLabel", "fromNox", "benefitEligible"]),
    end >= STORE_CUSTOMER_START_DATE ? dateDocuments("storeCustomerDaily", start < STORE_CUSTOMER_START_DATE ? STORE_CUSTOMER_START_DATE : start, end) : Promise.resolve([]),
    end >= ANALYTICS_START_DATE ? dateDocuments("adDailyStats", analyticsStart, end) : Promise.resolve([]),
    end >= TRAFFIC_SOURCE_START_DATE ? dateDocuments("analyticsTrafficDaily", start < TRAFFIC_SOURCE_START_DATE ? TRAFFIC_SOURCE_START_DATE : start, end) : Promise.resolve([]),
    start >= DURABLE_VISITOR_COMPLETE_START_DATE ? dateDocuments("analyticsPageVisitorDays", start, end) : Promise.resolve([]), uniqueVisitors(start, end)
  ]);
  const a = totals(analyticsDocs); const generalMembers = users.filter(doc => doc.get("role") === "user"); const aiCompletes = a.aiCompletes;
  const cv = { members: generalMembers.length, jobApplications: applications.length, storeApplications: storeApps.length, reviews: reviews.length, reservations: reservations.length, aiCompletes, other: 0 };
  const totalCv = Object.values(cv).reduce((sum, value) => sum + value, 0);
  const jobViews = jobStats.reduce((sum, doc) => sum + number(doc.get("count")), 0); const storeViews = storeStats.reduce((sum, doc) => sum + number(doc.get("count")), 0);
  const formViews = storeDaily.reduce((sum, doc) => sum + number(doc.get("reservation_form_view")), 0); const formSubmissions = storeDaily.reduce((sum, doc) => sum + number(doc.get("reservationForms")), 0); const storePageViews = storeDaily.reduce((sum, doc) => sum + number(doc.get("page_view")), 0);
  const reservation = { formViews, formSubmissions, cvr: rate(formSubmissions, formViews), total: reservations.length, nox: reservations.filter(d => d.get("fromNox") === true || d.get("source") === "nox_reservation").length, noxLabel: reservations.filter(d => d.get("sourceLabel") === "NOXを見た").length, benefit: reservations.filter(d => d.get("benefitEligible") === true).length, fromJob: reservations.filter(d => Boolean(d.get("jobId"))).length, direct: reservations.filter(d => !d.get("jobId")).length, statuses: { new: reservations.filter(d => d.get("status") === "new").length, confirmed: reservations.filter(d => d.get("status") === "confirmed").length, visited: reservations.filter(d => d.get("status") === "visited").length, cancelled: reservations.filter(d => d.get("status") === "cancelled").length } };
  const daily = rows(start, end);
  for (const doc of analyticsDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) { row.pv = number(row.pv) + number(doc.get("pv")); row.uu = number(row.uu) + number(doc.get("uu")); row.impressions = number(row.impressions) + number(doc.get("adImpressions")); row.clicks = number(row.clicks) + number(doc.get("adClicks")); } }
  for (const doc of jobStats) { const row = daily.get(String(doc.get("dateKey"))); if (row) row.jobViews = number(row.jobViews) + number(doc.get("count")); }
  for (const doc of storeStats) { const row = daily.get(String(doc.get("dateKey"))); if (row) row.storeViews = number(row.storeViews) + number(doc.get("count")); }
  for (const [docs, field] of [[generalMembers, "memberRegistrations"], [applications, "jobApplications"], [storeApps, "storeApplications"], [reviews, "reviews"], [reservations, "reservations"]] as const) for (const doc of docs) { const row = daily.get(timestampDateKey(doc.get("createdAt")) || ""); if (row) { row[field] = number(row[field]) + 1; row.cv = number(row.cv) + 1; } }
  for (const doc of analyticsDocs) { const row = daily.get(String(doc.get("dateKey"))); if (row) row.cv = number(row.cv) + number(doc.get("aiCompletes")); }
  for (const doc of adDaily) { const row = daily.get(String(doc.get("dateKey"))); if (row) { row.impressions = number(row.impressions) + 0; } }
  const jobMap = new Map<string, { views: number; storeName: string }>(); for (const doc of jobStats) { const id = String(doc.get("jobId") || ""); if (!id) continue; const current = jobMap.get(id) || { views: 0, storeName: String(doc.get("storeName") || "") }; current.views += number(doc.get("count")); jobMap.set(id, current); }
  const storeMap = new Map<string, { relatedViews: number; pageViews: number; formViews: number; reservations: number; benefit: number; noxLabel: number; name: string }>(); const storeRow = (id: string, name = "") => { const value = storeMap.get(id) || { relatedViews: 0, pageViews: 0, formViews: 0, reservations: 0, benefit: 0, noxLabel: 0, name }; storeMap.set(id, value); return value; };
  for (const doc of storeStats) { const id = String(doc.get("storeId") || ""); if (id) storeRow(id, String(doc.get("storeName") || "")).relatedViews += number(doc.get("count")); }
  for (const doc of storeDaily) { const id = String(doc.get("storeId") || ""); if (id) { const value = storeRow(id); value.pageViews += number(doc.get("page_view")); value.formViews += number(doc.get("reservation_form_view")); } }
  for (const doc of reservations) { const id = String(doc.get("storeId") || ""); if (id) { const value = storeRow(id, String(doc.get("storeName") || "")); value.reservations++; if (doc.get("benefitEligible") === true) value.benefit++; if (doc.get("sourceLabel") === "NOXを見た") value.noxLabel++; } }
  let jobRanking: unknown[] = []; if (includeRankings) { const top = [...jobMap].sort((x, y) => y[1].views - x[1].views).slice(0, 10); const snapshots = top.length ? await firestore.getAll(...top.map(([id]) => firestore.doc(`jobs/${id}`))) : []; const reservationsByJob = new Map<string, number>(); for (const d of reservations) reservationsByJob.set(String(d.get("jobId") || ""), (reservationsByJob.get(String(d.get("jobId") || "")) || 0) + 1); const appsByJob = new Map<string, number>(); for (const d of applications) appsByJob.set(String(d.get("jobId") || ""), (appsByJob.get(String(d.get("jobId") || "")) || 0) + 1); jobRanking = top.map(([id, value], i) => ({ id, title: snapshots[i]?.get("title") || snapshots[i]?.get("jobTitle") || id, storeName: snapshots[i]?.get("storeName") || value.storeName, views: value.views, applications: appsByJob.get(id) || 0, reservations: reservationsByJob.get(id) || 0, cv: (appsByJob.get(id) || 0) + (reservationsByJob.get(id) || 0), applicationRate: rate(appsByJob.get(id) || 0, value.views) })); }
  const storeRanking = includeRankings ? [...storeMap].map(([id, value]) => ({ id, ...value, reservationCvr: rate(value.reservations, value.formViews) })).filter(row => row.relatedViews || row.pageViews || row.reservations).sort((x, y) => (y.reservations - x.reservations) || (y.pageViews - x.pageViews) || (y.relatedViews - x.relatedViews)).slice(0, 10) : [];
  const trafficMap = new Map<string, { pv: number; uu: number }>(); for (const doc of trafficDaily) { const source = String(doc.get("source") || "other"); const value = trafficMap.get(source) || { pv: 0, uu: 0 }; value.pv += number(doc.get("pv")); value.uu += number(doc.get("uu")); trafficMap.set(source, value); }
  const adMap = new Map<string, { impressions: number; clicks: number }>(); for (const doc of adDaily) { const id = String(doc.get("adId") || ""); const value = adMap.get(id) || { impressions: 0, clicks: 0 }; value.impressions += number(doc.get("impressions")); value.clicks += number(doc.get("clicks")); adMap.set(id, value); }
  const pageUu = start >= DURABLE_VISITOR_COMPLETE_START_DATE ? Object.fromEntries(["top", "job_list", "job_detail", "store_detail", "other"].map(type => [type, new Set(pageVisitorDocs.filter(doc => doc.get("pageType") === type).map(doc => String(doc.get("visitorHash")))).size])) : null;
  return { analytics: a, uniqueUsers: visitorCount, cv, totalCv, jobViews, storeViews, storePageViews, reservation, daily: [...daily].map(([dateKey, values]) => ({ dateKey, ...values })), jobRanking, storeRanking, trafficSources: [...trafficMap].map(([source, value]) => ({ source, ...value })).sort((x, y) => y.pv - x.pv), adById: Object.fromEntries(adMap), pageUu };
}

export const getAdminDashboard = onCall(adminCallableOptions, async request => {
  await assertActiveAdmin(request.auth);
  const requested = typeof request.data?.period === "string" ? request.data.period : "30d";
  const period: DashboardPeriod = (["today", "7d", "30d", "month", "previous_month", "total", "custom"] as const).includes(requested as DashboardPeriod) ? requested as DashboardPeriod : "30d";
  const selected = dashboardRange(period, new Date(), request.data?.startDate, request.data?.endDate);
  const [current, previous, adsSnapshot, roleUsers, totalJobs, publicJobs, draftJobs, archivedJobs, totalStores, publicStores, contracts, reviews, casts] = await Promise.all([
    aggregateRange(selected.start, selected.end), selected.comparisonStart && selected.comparisonEnd ? aggregateRange(selected.comparisonStart, selected.comparisonEnd, false) : Promise.resolve(null),
    firestore.collection("ads").select("title", "advertiserName", "slot", "placement", "enabled", "impressions", "clicks").get(), firestore.collection("users").select("role").get(), count("jobs"),
    count("jobs", [["status", "==", "approved"], ["isPublic", "==", true], ["contractListingStatus", "==", "active"]]), count("jobs", [["status", "==", "draft"]]), count("jobs", [["status", "==", "archived"]]), count("stores"), count("stores", [["isPublic", "==", true], ["contractListingStatus", "==", "active"]]), count("storeContracts"), count("storeReviews"), count("casts")
  ]);
  const trafficCoverage = coverage(selected.start, selected.end, ANALYTICS_START_DATE); const cvr = dashboardCvr(current.totalCv, current.uniqueUsers || 0, trafficCoverage.complete && current.uniqueUsers !== null);
  const currentAdTotals = adsSnapshot.docs.reduce((r, d) => ({ impressions: r.impressions + number(d.get("impressions")), clicks: r.clicks + number(d.get("clicks")) }), { impressions: 0, clicks: 0 });
  const currentAdIds = new Set(adsSnapshot.docs.map(doc => doc.id)); const deletedAdTotals = Object.entries(current.adById).filter(([id]) => !currentAdIds.has(id)).reduce((r, [, value]) => ({ impressions: r.impressions + value.impressions, clicks: r.clicks + value.clicks }), { impressions: 0, clicks: 0 });
  const periodAd = { impressions: current.analytics.adImpressions, clicks: current.analytics.adClicks }; const isTotal = period === "total"; const adTotals = isTotal ? { impressions: currentAdTotals.impressions + deletedAdTotals.impressions, clicks: currentAdTotals.clicks + deletedAdTotals.clicks } : periodAd;
  const comparisons = previous ? { pv: comparisonRate(current.analytics.pv, previous.analytics.pv, trafficCoverage.complete), uu: comparisonRate(current.uniqueUsers || 0, previous.uniqueUsers || 0, trafficCoverage.complete && previous.uniqueUsers !== null), impressions: comparisonRate(adTotals.impressions, previous.analytics.adImpressions, trafficCoverage.complete), clicks: comparisonRate(adTotals.clicks, previous.analytics.adClicks, trafficCoverage.complete), cv: comparisonRate(current.totalCv, previous.totalCv), jobViews: comparisonRate(current.jobViews, previous.jobViews, selected.comparisonStart! >= JOB_VIEW_START_DATE), storeViews: comparisonRate(current.storeViews, previous.storeViews, selected.comparisonStart! >= STORE_VIEW_START_DATE) } : null;
  const roleCount = (role: string) => roleUsers.docs.filter(doc => doc.get("role") === role).length;
  return { period, periodStart: selected.start, periodEnd: selected.end, comparisonPeriod: selected.comparisonStart ? { start: selected.comparisonStart, end: selected.comparisonEnd } : null, comparisons,
    measurementStartDate: ANALYTICS_START_DATE, dataQuality: { pv: trafficCoverage, uu: trafficCoverage, jobViews: coverage(selected.start, selected.end, JOB_VIEW_START_DATE), storeViews: coverage(selected.start, selected.end, STORE_VIEW_START_DATE), storeCustomer: coverage(selected.start, selected.end, STORE_CUSTOMER_START_DATE), trafficSources: coverage(selected.start, selected.end, TRAFFIC_SOURCE_START_DATE), advertising: { ...trafficCoverage, label: isTotal ? "確認可能最低値" : trafficCoverage.label } },
    kpis: { pv: current.analytics.pv, uu: current.uniqueUsers, pvPerUu: current.uniqueUsers ? current.analytics.pv / current.uniqueUsers : null, impressions: adTotals.impressions, clicks: adTotals.clicks, ctr: rate(adTotals.clicks, adTotals.impressions), conversions: current.totalCv, cvr: cvr.value, cvrEligible: cvr.eligible, jobViews: current.jobViews, storeViews: current.storeViews, storePageViews: current.storePageViews },
    conversions: current.cv, reservations: current.reservation, daily: current.daily, rankings: { jobs: current.jobRanking, stores: current.storeRanking },
    pages: { top: current.analytics.topPv, jobList: current.analytics.jobListPv, jobDetail: current.analytics.jobDetailPv, storeDetail: current.analytics.storeDetailPv, other: current.analytics.otherPv, uu: current.pageUu, uuStartDate: DURABLE_VISITOR_COMPLETE_START_DATE },
    current: { totalUsers: roleUsers.size, generalUsers: roleCount("user"), storeUsers: roleCount("store"), admins: roleCount("admin"), totalJobs, publicJobs, privateJobs: totalJobs - publicJobs, draftJobs, archivedJobs, totalStores, publicStores, contracts, ads: adsSnapshot.size, reviews, casts },
    advertising: { total: { ...adTotals, ctr: rate(adTotals.clicks, adTotals.impressions) }, currentCounter: currentAdTotals, deletedHistory: deletedAdTotals, isConfirmedMinimum: isTotal && (deletedAdTotals.impressions > 0 || deletedAdTotals.clicks > 0) },
    ads: adsSnapshot.docs.map(doc => { const selectedAd = isTotal ? { impressions: number(doc.get("impressions")), clicks: number(doc.get("clicks")) } : current.adById[doc.id] || { impressions: 0, clicks: 0 }; return { id: doc.id, slot: doc.get("slot") || doc.id, name: doc.get("title") || doc.get("advertiserName") || doc.id, placement: doc.get("placement") || "TOP", enabled: doc.get("enabled") === true, ...selectedAd, ctr: rate(selectedAd.clicks, selectedAd.impressions) }; }), trafficSources: { measured: selected.end >= TRAFFIC_SOURCE_START_DATE, startDate: TRAFFIC_SOURCE_START_DATE, rows: current.trafficSources }
  };
});
