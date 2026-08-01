import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  error as logError
} from "firebase-functions/logger";

import {
  createHash
} from "node:crypto";

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  adminCallableOptions
} from "../config";

import {
  firestore
} from "../firebaseAdmin";

import {
  assertActiveAdmin
} from "../security/adminAuthorization";

const APPLICATION_ID_PATTERN =
  /^[A-Za-z0-9]{20}$/;

function publicError(
  code:
    | "invalid-argument"
    | "not-found"
    | "failed-precondition"
    | "internal",
  message: string
): HttpsError {
  return new HttpsError(code, message);
}

function parseApplicationId(
  value: unknown
): string {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw publicError(
      "invalid-argument",
      "Approval input is invalid."
    );
  }

  const applicationId =
    (value as Record<string, unknown>)
      .applicationId;
  if (
    typeof applicationId !== "string" ||
    !APPLICATION_ID_PATTERN.test(
      applicationId
    )
  ) {
    throw publicError(
      "invalid-argument",
      "Approval input is invalid."
    );
  }
  return applicationId;
}

function targetHash(
  applicationId: string
): string {
  return createHash("sha256")
    .update(applicationId, "utf8")
    .digest("hex");
}

function isTimestamp(
  value: unknown
): value is Timestamp {
  return (
    value !== null &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (
      value as { toMillis?: unknown }
    ).toMillis === "function"
  );
}

function failedPrecondition(
  reason: string
): HttpsError {
  logError(
    "Job application approval rejected.",
    { reason }
  );
  return publicError(
    "failed-precondition",
    "Job cannot be published."
  );
}

function requireMatchingOwnership(
  application:
    FirebaseFirestore.DocumentData,
  job: FirebaseFirestore.DocumentData,
  applicationId: string
): string {
  const jobId = application.jobId;
  const storeId = application.storeId;

  if (
    typeof jobId !== "string" ||
    jobId !== applicationId ||
    typeof storeId !== "string" ||
    storeId.length === 0 ||
    application.ownerId !== storeId ||
    application.submittedBy !== storeId ||
    job.ownerId !== storeId ||
    job.storeId !== storeId ||
    job.sourceApplicationId !==
      applicationId
  ) {
    throw failedPrecondition(
      "job-ownership-inconsistent"
    );
  }
  return storeId;
}

function requirePublishableContract(
  store: FirebaseFirestore.DocumentData,
  contract: FirebaseFirestore.DocumentData,
  storeId: string,
  now: Timestamp
): void {
  if (
    store.ownerId !== storeId ||
    store.isPublic !== true ||
    store.contractListingStatus !== "active" ||
    contract.ownerId !== storeId ||
    contract.paymentStatus !== "paid" ||
    contract.listingStatus !== "active" ||
    !isTimestamp(contract.contractStartAt) ||
    !isTimestamp(contract.contractEndAt) ||
    contract.contractStartAt.toMillis() > now.toMillis() ||
    contract.contractEndAt.toMillis() < now.toMillis()
  ) {
    throw failedPrecondition(
      "store-contract-not-publishable"
    );
  }
}

function isFullyApproved(
  application:
    FirebaseFirestore.DocumentData,
  job: FirebaseFirestore.DocumentData
): boolean {
  return (
    application.status === "approved" &&
    job.status === "approved" &&
    job.isPublic === true &&
    job.contractListingStatus ===
      "active"
  );
}

export const approveJobApplication =
  onCall(
    adminCallableOptions,
    async (request) => {
      const admin =
        await assertActiveAdmin(
          request.auth
        );
      const applicationId =
        parseApplicationId(request.data);
      const hash =
        targetHash(applicationId);

      const applicationReference =
        firestore.doc(
          `jobApplications/${applicationId}`
        );
      const auditReference =
        firestore.doc(
          `adminAuditLogs/approve_job_${hash}`
        );

      try {
        return await firestore.runTransaction(
          async (transaction) => {
            const applicationSnapshot =
              await transaction.get(
                applicationReference
              );
            if (!applicationSnapshot.exists) {
              throw publicError(
                "not-found",
                "Approval target was not found."
              );
            }

            const application =
              applicationSnapshot.data() ?? {};
            const jobId =
              application.jobId;
            if (
              typeof jobId !== "string" ||
              !APPLICATION_ID_PATTERN.test(
                jobId
              )
            ) {
              throw failedPrecondition(
                "job-reference-invalid"
              );
            }

            const jobReference =
              firestore.doc(`jobs/${jobId}`);
            const jobSnapshot =
              await transaction.get(
                jobReference
              );
            if (!jobSnapshot.exists) {
              throw publicError(
                "not-found",
                "Approval target was not found."
              );
            }

            const job =
              jobSnapshot.data() ?? {};
            const storeId =
              requireMatchingOwnership(
                application,
                job,
                applicationId
              );
            const storeQuery = firestore
  .collection("stores")
  .where("ownerId", "==", storeId)
  .limit(1);

const contractReference =
  firestore.doc(
    `storeContracts/${storeId}`
  );

const [
  storeQuerySnapshot,
  contractSnapshot,
  auditSnapshot
] = await Promise.all([
  transaction.get(storeQuery),
  transaction.get(contractReference),
  transaction.get(auditReference)
]);

const storeSnapshot =
  storeQuerySnapshot.docs[0];

if (
  storeQuerySnapshot.empty ||
  !contractSnapshot.exists
) {
  throw failedPrecondition(
    "store-contract-missing"
  );
}

const now = Timestamp.now();

requirePublishableContract(
  storeSnapshot.data() ?? {},
  contractSnapshot.data() ?? {},
  storeId,
  now
);

if (
  isFullyApproved(
    application,
    job
  )
) {
  return {
    approved: true,
    idempotent: true
  };
}

if (
  ![
    "pending",
    "approved"
  ].includes(application.status) ||
  ![
    "pending",
    "reapproval_pending",
    "paused",
    "approved"
  ].includes(job.status)
) {
  throw failedPrecondition(
    "approval-state-invalid"
  );
}

transaction.update(
  applicationReference,
  {
    status: "approved",
    approvedAt:
      FieldValue.serverTimestamp(),
    approvedBy: admin.uid,
    updatedAt:
      FieldValue.serverTimestamp()
  }
);

transaction.update(
  jobReference,
  {
    status: "approved",
    isPublic: true,
    contractListingStatus:
      "active",
    approvedAt:
      FieldValue.serverTimestamp(),
    approvedBy: admin.uid,
    updatedAt:
      FieldValue.serverTimestamp(),
    updatedBy: admin.uid
  }
);

if (!auditSnapshot.exists) {
  transaction.create(
    auditReference,
    {
      actionType:
        "approve_job_application",
      targetType: "job",
      targetHash: hash,
      before: {
        applicationStatus:
          application.status ?? null,
        jobStatus:
          job.status ?? null,
        isPublic:
          job.isPublic === true,
        contractListingStatus:
          job.contractListingStatus ??
          null
      },
      after: {
        applicationStatus:
          "approved",
        jobStatus:
          "approved",
        isPublic: true,
        contractListingStatus:
          "active"
      },
      createdAt:
        FieldValue.serverTimestamp(),
      actorType:
        "fixed_admin"
    }
  );
}

return {
  approved: true,
  idempotent: false
};
});
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        logError(
          "Job application approval failed.",
          { reason: "transaction-failed" }
        );
        throw publicError(
          "internal",
          "Job approval failed."
        );
      }
    }
  );
