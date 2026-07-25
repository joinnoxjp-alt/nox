"use strict";

/**
 * NOX Phase 1 Firestore read-only audit.
 *
 * SAFETY
 * ------
 * This script imports and uses Firestore read APIs only. It does not import or
 * call create, set, update, delete, batch, transaction, Auth mutation, Storage,
 * Rules, or deployment APIs.
 *
 * DO NOT RUN without the repository owner's explicit approval.
 *
 * Authentication (required only when an approved run is performed):
 * - Preferred: GOOGLE_APPLICATION_CREDENTIALS points to a dedicated service
 *   account key whose IAM role grants Firestore read access only.
 * - Alternative: Application Default Credentials with equivalent read-only IAM.
 * - Never place credentials or service-account JSON inside this repository.
 *
 * Admin SDK credentials bypass Firestore Security Rules. Read-only IAM is
 * therefore a required safety boundary even though this source is read-only.
 *
 * Future approved invocation:
 *   node scripts/audit-data.js --confirm-read-only-audit
 *
 * Optional project selection:
 *   FIREBASE_PROJECT_ID=noxapp-29171
 *
 * Dependencies are intentionally not installed by Phase 1 preparation:
 *   firebase-admin
 */

const REQUIRED_CONFIRMATION = "--confirm-read-only-audit";
const KNOWN_COLLECTIONS = [
  "users",
  "stores",
  "jobs",
  "applications",
  "jobEntries",
  "jobApplications",
  "jobViewStats",
  "storeViewStats"
];

function printUsage() {
  process.stdout.write(
    [
      "NOX Firestore read-only audit",
      "",
      "This script reads complete collections and may incur Firestore reads.",
      "It does not write to Firestore or Storage.",
      "",
      "Required before execution:",
      "1. Explicit owner approval for the individual audit run.",
      "2. Read-only Google Cloud IAM credentials.",
      "3. firebase-admin installed outside or for the approved audit environment.",
      "",
      `Run: node scripts/audit-data.js ${REQUIRED_CONFIRMATION}`,
      ""
    ].join("\n")
  );
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizedName(value) {
  return hasValue(value) ? String(value).trim().toLocaleLowerCase("ja-JP") : "";
}

function incrementNestedCount(target, firstKey, secondKey) {
  const first = hasValue(firstKey) ? String(firstKey) : "(missing)";
  const second = hasValue(secondKey) ? String(secondKey) : "(missing)";

  if (!target[first]) {
    target[first] = {};
  }

  target[first][second] = (target[first][second] || 0) + 1;
}

function missingFieldIds(documents, field) {
  return documents
    .filter((document) => !hasValue(document.data[field]))
    .map((document) => document.id);
}

function fieldInventory(documents) {
  const counts = new Map();

  for (const document of documents) {
    for (const field of Object.keys(document.data)) {
      counts.set(field, (counts.get(field) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, count]) => ({ field, count }));
}

function duplicateStoreNames(stores) {
  const groups = new Map();

  for (const store of stores) {
    const displayName = hasValue(store.data.storeName)
      ? String(store.data.storeName).trim()
      : "";
    const key = normalizedName(displayName);

    if (!key) {
      continue;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        storeName: displayName,
        documentIds: []
      });
    }

    groups.get(key).documentIds.push(store.id);
  }

  return [...groups.values()]
    .filter((group) => group.documentIds.length > 1)
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "ja"));
}

function buildOwnerIndexes(stores) {
  const byOwnerId = new Map();
  const byName = new Map();

  for (const store of stores) {
    if (hasValue(store.data.ownerId)) {
      byOwnerId.set(String(store.data.ownerId), store.id);
    }

    const nameKey = normalizedName(store.data.storeName);
    if (!nameKey) {
      continue;
    }

    if (!byName.has(nameKey)) {
      byName.set(nameKey, []);
    }

    byName.get(nameKey).push(store.id);
  }

  return { byOwnerId, byName };
}

function unresolvedOwnership(collectionName, documents, storeIndexes) {
  const results = [];

  for (const document of documents) {
    const ownerCandidates = [
      document.data.ownerId,
      document.data.storeId,
      document.data.userId
    ].filter(hasValue);

    if (ownerCandidates.length > 0) {
      continue;
    }

    const storeNameKey = normalizedName(document.data.storeName);
    const nameMatches = storeNameKey
      ? storeIndexes.byName.get(storeNameKey) || []
      : [];

    let reason = "missing ownerId/storeId/userId and storeName";

    if (storeNameKey && nameMatches.length === 0) {
      reason = "storeName has no matching store document";
    } else if (nameMatches.length === 1) {
      reason = "only name-based guess is possible";
    } else if (nameMatches.length > 1) {
      reason = "storeName matches multiple store documents";
    }

    results.push({
      collection: collectionName,
      id: document.id,
      storeName: hasValue(document.data.storeName)
        ? String(document.data.storeName)
        : null,
      candidateStoreDocumentIds: nameMatches,
      reason
    });
  }

  return results;
}

async function loadCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();

  return snapshot.docs.map((document) => ({
    id: document.id,
    data: document.data()
  }));
}

async function main() {
  if (!process.argv.includes(REQUIRED_CONFIRMATION)) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const { applicationDefault, initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  const app = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
  const db = getFirestore(app);

  const loadedEntries = await Promise.all(
    KNOWN_COLLECTIONS.map(async (collectionName) => [
      collectionName,
      await loadCollection(db, collectionName)
    ])
  );
  const collections = Object.fromEntries(loadedEntries);

  const usersByRoleAndStatus = {};
  for (const user of collections.users) {
    incrementNestedCount(
      usersByRoleAndStatus,
      user.data.role,
      user.data.status
    );
  }

  const storesMissingOwnerId = missingFieldIds(collections.stores, "ownerId");
  const storesWithOwnerMismatch = collections.stores
    .filter(
      (store) =>
        hasValue(store.data.ownerId) &&
        String(store.data.ownerId) !== store.id
    )
    .map((store) => ({
      id: store.id,
      ownerId: String(store.data.ownerId)
    }));

  const storeIndexes = buildOwnerIndexes(collections.stores);
  const duplicateNames = duplicateStoreNames(collections.stores);

  const unresolvedOwners = [
    ...unresolvedOwnership("jobs", collections.jobs, storeIndexes),
    ...unresolvedOwnership(
      "jobApplications",
      collections.jobApplications,
      storeIndexes
    ),
    ...unresolvedOwnership(
      "applications",
      collections.applications,
      storeIndexes
    ),
    ...unresolvedOwnership(
      "jobEntries",
      collections.jobEntries,
      storeIndexes
    ),
    ...unresolvedOwnership(
      "jobViewStats",
      collections.jobViewStats,
      storeIndexes
    ),
    ...unresolvedOwnership(
      "storeViewStats",
      collections.storeViewStats,
      storeIndexes
    )
  ];

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      projectId: projectId || "(resolved by Application Default Credentials)",
      collectionsRead: KNOWN_COLLECTIONS
    },
    collectionCounts: Object.fromEntries(
      KNOWN_COLLECTIONS.map((name) => [name, collections[name].length])
    ),
    users: {
      countsByRoleAndStatus: usersByRoleAndStatus
    },
    stores: {
      missingOwnerId: storesMissingOwnerId,
      documentIdOwnerIdMismatch: storesWithOwnerMismatch
    },
    jobs: {
      missingOwnerId: missingFieldIds(collections.jobs, "ownerId"),
      missingStoreId: missingFieldIds(collections.jobs, "storeId"),
      missingStatus: missingFieldIds(collections.jobs, "status")
    },
    applications: {
      missingApplicantId: missingFieldIds(
        collections.applications,
        "applicantId"
      ),
      missingStoreId: missingFieldIds(collections.applications, "storeId"),
      missingJobId: missingFieldIds(collections.applications, "jobId")
    },
    jobEntries: {
      count: collections.jobEntries.length,
      observedFields: fieldInventory(collections.jobEntries)
    },
    jobApplications: {
      missingOwnerId: missingFieldIds(
        collections.jobApplications,
        "ownerId"
      ),
      missingSubmittedBy: missingFieldIds(
        collections.jobApplications,
        "submittedBy"
      )
    },
    jobViewStats: {
      missingStoreId: missingFieldIds(collections.jobViewStats, "storeId")
    },
    storeViewStats: {
      missingStoreId: missingFieldIds(collections.storeViewStats, "storeId")
    },
    duplicateStoreNames: duplicateNames,
    unresolvedOwnership: unresolvedOwners
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `Read-only audit failed: ${error && error.stack ? error.stack : error}\n`
  );
  process.exitCode = 1;
});
