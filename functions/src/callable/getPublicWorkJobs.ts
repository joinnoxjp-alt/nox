import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";

const PUBLIC_FIELDS = ["jobId","companyId","companyName","title","industry","occupation","employmentType","salary","location","station","workHours","holidays","description","requirements","benefits","beginnerWelcome","ageRequirement","mainImageUrl","logoUrl","imageUrls","applyType","applyValue","lineUrl","instagramUrl","xUrl","tiktokUrl","websiteUrl","publishStartDate","publishEndDate","displayOrder"];
function publicJob(id: string, data: FirebaseFirestore.DocumentData) { return Object.fromEntries([["jobId", id], ...PUBLIC_FIELDS.filter((key) => key !== "jobId").map((key) => [key, data[key] ?? (key === "imageUrls" ? [] : "")])]); }
function active(data: FirebaseFirestore.DocumentData, today: string) { return data.status === "published" && data.isPublic === true && (!data.publishStartDate || data.publishStartDate <= today) && (!data.publishEndDate || data.publishEndDate >= today); }

export const getPublicWorkJobs = onCall(publicCallableOptions, async () => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  const snapshot = await firestore.collection("workJobs").where("isPublic", "==", true).get();
  return { jobs: snapshot.docs.filter((doc) => active(doc.data(), today)).map((doc) => publicJob(doc.id, doc.data())).sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder)) };
});
export const getPublicWorkJob = onCall(publicCallableOptions, async (request) => {
  const jobId = typeof request.data?.jobId === "string" ? request.data.jobId.trim() : "";
  if (!jobId) throw new HttpsError("invalid-argument", "求人IDが必要です。");
  const snapshot = await firestore.doc(`workJobs/${jobId}`).get();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  if (!snapshot.exists || !active(snapshot.data() ?? {}, today)) throw new HttpsError("not-found", "求人が見つかりません。");
  return { job: publicJob(snapshot.id, snapshot.data() ?? {}) };
});
