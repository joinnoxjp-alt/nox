import {
  onDocumentCreated
} from "firebase-functions/v2/firestore";

import {
  discordTriggerOptions
} from "../config";
import {
  buildUserCreatedMessage
} from "../notifications/discordMessages";
import {
  processDiscordNotification
} from "../notifications/discordNotifier";

export const notifyDiscordOnUserCreated =
  onDocumentCreated(
    {
      ...discordTriggerOptions,
      document: "users/{uid}"
    },
    async (event) => {
      if (!event.data) {
        return;
      }
      await processDiscordNotification({
        eventType: "user_created",
        sourceCollection: "users",
        sourceDocumentPath:
          event.data.ref.path,
        message: buildUserCreatedMessage(
          event.data.data(),
          event.time
        )
      });
    }
  );
