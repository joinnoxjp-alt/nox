import {
  createHash
} from "node:crypto";

import {
  FieldValue,
  Firestore
} from "firebase-admin/firestore";

import {
  firestore
} from "../firebaseAdmin";
import {
  DISCORD_OPERATIONS_WEBHOOK_URL
} from "./discordConfig";
import {
  DiscordMessage,
  NotificationProcessInput,
  NotificationProcessResult
} from "../types/discordNotification";

type DiscordSender = (
  message: DiscordMessage
) => Promise<void>;

function notificationKey(
  eventType: string,
  sourceDocumentPath: string
): string {
  return createHash("sha256")
    .update(
      `${eventType}:${sourceDocumentPath}`,
      "utf8"
    )
    .digest("hex");
}

function isAllowedDiscordWebhook(
  value: string
): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (
        url.hostname === "discord.com"
        || url.hostname === "discordapp.com"
      )
      && url.pathname.startsWith(
        "/api/webhooks/"
      );
  } catch {
    return false;
  }
}

export async function sendDiscordMessage(
  message: DiscordMessage,
  webhookUrl =
    DISCORD_OPERATIONS_WEBHOOK_URL.value(),
  fetchImplementation: typeof fetch = fetch
): Promise<void> {
  if (!isAllowedDiscordWebhook(webhookUrl)) {
    throw new Error(
      "discord-webhook-unavailable"
    );
  }

  const response = await fetchImplementation(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000)
    }
  );

  if (!response.ok) {
    throw new Error(
      "discord-delivery-failed"
    );
  }
}

export async function processDiscordNotification(
  input: NotificationProcessInput,
  options: {
    database?: Firestore;
    sender?: DiscordSender;
  } = {}
): Promise<NotificationProcessResult> {
  const database =
    options.database ?? firestore;
  const sender =
    options.sender ?? sendDiscordMessage;
  const eventKey = notificationKey(
    input.eventType,
    input.sourceDocumentPath
  );
  const notificationRef = database.doc(
    `discordNotifications/${eventKey}`
  );

  const claimed = await database.runTransaction(
    async (transaction) => {
      const existing =
        await transaction.get(notificationRef);
      if (existing.exists) {
        return false;
      }
      transaction.create(notificationRef, {
        schemaVersion: 1,
        eventType: input.eventType,
        sourceCollection:
          input.sourceCollection,
        sourcePathHash: eventKey,
        status: "processing",
        attempts: 1,
        createdAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp()
      });
      return true;
    }
  );

  if (!claimed) {
    return {
      status: "duplicate"
    };
  }

  try {
    await sender(input.message);
    await notificationRef.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      updatedAt:
        FieldValue.serverTimestamp()
    });
    return {
      status: "sent"
    };
  } catch {
    await notificationRef.update({
      status: "failed",
      failureCode: "delivery_failed",
      failedAt:
        FieldValue.serverTimestamp(),
      updatedAt:
        FieldValue.serverTimestamp()
    });
    return {
      status: "failed"
    };
  }
}
