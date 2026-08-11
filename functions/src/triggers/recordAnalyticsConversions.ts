import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { REGION, FUNCTIONS_RUNTIME_SERVICE_ACCOUNT } from "../config";
import { recordConversion } from "../analytics/recordAnalyticsEvent";

const options = { region: REGION, retry: false, serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT };
export const recordMemberRegistration = onDocumentCreated({ ...options, document: "users/{uid}" }, async (event) => {
  if (event.data?.data().role === "user") await recordConversion("memberRegistrations", event.data.ref.path);
});
export const recordJobApplicationConversion = onDocumentCreated({ ...options, document: "applications/{id}" }, async (event) => event.data && recordConversion("jobApplications", event.data.ref.path));
export const recordStoreApplicationConversion = onDocumentCreated({ ...options, document: "storeApplications/{id}" }, async (event) => event.data && recordConversion("storeApplications", event.data.ref.path));
export const recordReviewSubmissionConversion = onDocumentCreated({ ...options, document: "storeReviews/{id}" }, async (event) => event.data && recordConversion("reviewSubmissions", event.data.ref.path));
