import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../firebaseAdmin";

export const ANALYTICS_START_DATE = "2026-08-12";

export type AnalyticsEventType =
  | "page_view" | "ad_impression" | "ad_click"
  | "ai_start" | "ai_complete";

const PAGE_FIELDS: Record<string, string> = {
  top: "topPv", job_list: "jobListPv", job_detail: "jobDetailPv",
  store_detail: "storeDetailPv", other: "otherPv"
};

export function japanDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function safeId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function recordAnalyticsEvent(input: {
  eventId: string;
  visitorId: string;
  type: AnalyticsEventType;
  pageType?: string;
  adId?: string;
}): Promise<"recorded" | "duplicate"> {
  const dateKey = japanDateKey();
  const eventHash = safeId(input.eventId);
  const visitorHash = safeId(input.visitorId);
  const dailyRef = firestore.doc(`analyticsDaily/${dateKey}`);
  const dedupeRef = firestore.doc(`analyticsEventDedupe/${eventHash}`);
  const visitorRef = firestore.doc(`analyticsDaily/${dateKey}/visitors/${visitorHash}`);
  const globalVisitorRef = firestore.doc(`analyticsVisitors/${visitorHash}`);
  const adId = input.adId?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const adRef = adId ? firestore.doc(`ads/${adId}`) : null;

  return firestore.runTransaction(async (transaction) => {
    const [dedupe, visitor, globalVisitor, adSnapshot] = await Promise.all([
      transaction.get(dedupeRef),
      input.type === "page_view" ? transaction.get(visitorRef) : Promise.resolve(null),
      input.type === "page_view" ? transaction.get(globalVisitorRef) : Promise.resolve(null),
      adRef ? transaction.get(adRef) : Promise.resolve(null)
    ]);
    if (dedupe.exists) return "duplicate";
    if ((input.type === "ad_impression" || input.type === "ad_click")
      && (!adSnapshot?.exists || adSnapshot.get("enabled") !== true)) return "duplicate";

    const increments: Record<string, unknown> = {
      dateKey, updatedAt: FieldValue.serverTimestamp()
    };
    if (input.type === "page_view") {
      increments.pv = FieldValue.increment(1);
      increments[PAGE_FIELDS[input.pageType ?? "other"] ?? "otherPv"] = FieldValue.increment(1);
      if (!visitor?.exists) {
        increments.uu = FieldValue.increment(1);
        transaction.create(visitorRef, {
          createdAt: FieldValue.serverTimestamp(),
          expireAt: new Date(Date.now() + 35 * 86_400_000)
        });
      }
      transaction.set(globalVisitorRef, {
        lastSeenDateKey: dateKey,
        lastSeenAt: FieldValue.serverTimestamp(),
        ...(!globalVisitor?.exists ? { firstSeenAt: FieldValue.serverTimestamp() } : {})
      }, { merge: true });
    } else {
      const field = { ad_impression: "adImpressions", ad_click: "adClicks",
        ai_start: "aiStarts", ai_complete: "aiCompletes" }[input.type];
      increments[field] = FieldValue.increment(1);
    }
    transaction.set(dailyRef, increments, { merge: true });
    transaction.create(dedupeRef, { dateKey, type: input.type, expireAt: new Date(Date.now() + 35 * 86_400_000) });

    if (adId && (input.type === "ad_impression" || input.type === "ad_click")) {
      const field = input.type === "ad_impression" ? "impressions" : "clicks";
      transaction.set(firestore.doc(`adDailyStats/${dateKey}_${adId}`), {
        dateKey, adId, [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(adRef!, {
        [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    return "recorded";
  });
}

export async function recordConversion(field: "memberRegistrations" | "jobApplications" | "storeApplications" | "reviewSubmissions", sourcePath: string) {
  const dateKey = japanDateKey();
  const dedupeRef = firestore.doc(`analyticsConversionDedupe/${safeId(`${field}:${sourcePath}`)}`);
  await firestore.runTransaction(async (transaction) => {
    if ((await transaction.get(dedupeRef)).exists) return;
    transaction.create(dedupeRef, { dateKey, field, createdAt: FieldValue.serverTimestamp() });
    transaction.set(firestore.doc(`analyticsDaily/${dateKey}`), {
      dateKey, conversions: FieldValue.increment(1), [field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}
