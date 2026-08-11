import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { AnalyticsEventType, recordAnalyticsEvent } from "../analytics/recordAnalyticsEvent";

const TYPES = new Set<AnalyticsEventType>(["page_view", "ad_impression", "ad_click", "ai_start", "ai_complete"]);
function limited(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length < 8 || value.length > max) throw new HttpsError("invalid-argument", "Invalid analytics event.");
  return value;
}

export const trackAnalyticsEvent = onCall(publicCallableOptions, async (request) => {
  const type = request.data?.type as AnalyticsEventType;
  if (!TYPES.has(type)) throw new HttpsError("invalid-argument", "Invalid analytics event.");
  const result = await recordAnalyticsEvent({
    type, eventId: limited(request.data?.eventId, 128), visitorId: limited(request.data?.visitorId, 128),
    pageType: typeof request.data?.pageType === "string" ? request.data.pageType : undefined,
    adId: typeof request.data?.adId === "string" ? request.data.adId : undefined
  });
  return { status: result };
});
