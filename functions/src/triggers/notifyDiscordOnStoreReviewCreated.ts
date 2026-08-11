import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { discordTriggerOptions } from "../notifications/discordConfig";
import { buildStoreReviewCreatedMessage } from "../notifications/discordMessages";
import { processDiscordNotification } from "../notifications/discordNotifier";

export const notifyDiscordOnStoreReviewCreated = onDocumentCreated(
  {
    ...discordTriggerOptions,
    document: "storeReviews/{reviewId}"
  },
  async (event) => {
    if (!event.data) return;
    await processDiscordNotification({
      eventType: "store_review_created",
      sourceCollection: "storeReviews",
      sourceDocumentPath: event.data.ref.path,
      message: buildStoreReviewCreatedMessage(
        event.params.reviewId,
        event.data.data(),
        event.time
      )
    });
  }
);
