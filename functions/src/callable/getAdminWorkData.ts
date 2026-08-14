import { onCall } from "firebase-functions/v2/https";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const getAdminWorkData = onCall(adminCallableOptions, async (request) => {
  await assertActiveAdmin(request.auth);
  const [companies, jobs] = await Promise.all([
    firestore.collection("workCompanies").orderBy("name").get(),
    firestore.collection("workJobs").orderBy("updatedAt", "desc").get(),
  ]);
  return {
    companies: companies.docs.map((doc) => ({ companyId: doc.id, ...doc.data() })),
    jobs: jobs.docs.map((doc) => ({ jobId: doc.id, ...doc.data() })),
  };
});
