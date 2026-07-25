import assert from "node:assert/strict";
import {
  after,
  beforeEach,
  test
} from "node:test";

import {
  deleteApp,
  initializeApp
} from "firebase-admin/app";
import {
  getFirestore
} from "firebase-admin/firestore";

import {
  processDiscordNotification
} from "../src/notifications/discordNotifier";

const PROJECT_ID = "demo-nox-local";
const FIRESTORE_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? "";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !FIRESTORE_HOST
) {
  throw new Error(
    "Discord integration tests require only the " +
      "demo-nox-local Firestore Emulator."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "discord-notifier-integration"
);
const firestore = getFirestore(app);

async function clearCollection(
  collectionName: string
): Promise<void> {
  const snapshot = await firestore
    .collection(collectionName)
    .get();
  await Promise.all(
    snapshot.docs.map((document) =>
      document.ref.delete()
    )
  );
}

beforeEach(async () => {
  await clearCollection(
    "discordNotifications"
  );
  await clearCollection(
    "storeApplications"
  );
});

after(async () => {
  await clearCollection(
    "discordNotifications"
  );
  await clearCollection(
    "storeApplications"
  );
  await deleteApp(app);
});

test(
  "the same source event sends only once and stores no secret or payload",
  async () => {
    let sendCount = 0;
    const sender = async (): Promise<void> => {
      sendCount += 1;
    };
    const input = {
      eventType:
        "store_application_created" as const,
      sourceCollection:
        "storeApplications" as const,
      sourceDocumentPath:
        "storeApplications/repeated-event",
      message: {
        content:
          "private-contact@example.test",
        allowed_mentions: {
          parse: [] as []
        }
      }
    };

    const first =
      await processDiscordNotification(
        input,
        {
          database: firestore,
          sender
        }
      );
    const second =
      await processDiscordNotification(
        input,
        {
          database: firestore,
          sender
        }
      );

    assert.equal(first.status, "sent");
    assert.equal(second.status, "duplicate");
    assert.equal(sendCount, 1);

    const records = await firestore
      .collection("discordNotifications")
      .get();
    assert.equal(records.size, 1);
    const stored = records.docs[0].data();
    assert.equal(stored.status, "sent");
    assert.equal(stored.attempts, 1);
    assert.equal(
      stored.sourceCollection,
      "storeApplications"
    );
    const serialized = JSON.stringify(stored);
    assert.doesNotMatch(
      serialized,
      /private-contact|webhook|discord\.com/
    );
    assert.equal(
      records.docs[0].id.length,
      64
    );
  }
);

test(
  "delivery failure is finite and never removes the source document",
  async () => {
    const sourceRef = firestore.doc(
      "storeApplications/failing-event"
    );
    await sourceRef.set({
      storeName: "Test Store",
      status: "pending"
    });
    let sendCount = 0;

    const result =
      await processDiscordNotification(
        {
          eventType:
            "store_application_created",
          sourceCollection:
            "storeApplications",
          sourceDocumentPath:
            sourceRef.path,
          message: {
            content: "safe test message",
            allowed_mentions: {
              parse: []
            }
          }
        },
        {
          database: firestore,
          sender: async () => {
            sendCount += 1;
            throw new Error(
              "mock-delivery-failure"
            );
          }
        }
      );

    assert.equal(result.status, "failed");
    assert.equal(sendCount, 1);
    assert.equal(
      (await sourceRef.get()).exists,
      true
    );

    const records = await firestore
      .collection("discordNotifications")
      .get();
    assert.equal(records.size, 1);
    const stored = records.docs[0].data();
    assert.equal(stored.status, "failed");
    assert.equal(
      stored.failureCode,
      "delivery_failed"
    );
    assert.equal(stored.attempts, 1);
  }
);
