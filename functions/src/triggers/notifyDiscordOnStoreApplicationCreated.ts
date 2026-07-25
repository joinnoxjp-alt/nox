import {
  onDocumentCreated
} from "firebase-functions/v2/firestore";

import {
  discordTriggerOptions
} from "../config";
import {
  buildStoreApplicationCreatedMessage
} from "../notifications/discordMessages";
import {
  processDiscordNotification
} from "../notifications/discordNotifier";

export const notifyDiscordOnStoreApplicationCreated =
  onDocumentCreated(
    {
      ...discordTriggerOptions,
      document:
        "storeApplications/{applicationId}"
    },
    async (event) => {
      if (!event.data) {
        return;
      }
      await processDiscordNotification({
        eventType:
          "store_application_created",
        sourceCollection:
          "storeApplications",
        sourceDocumentPath:
          event.data.ref.path,
        message:
          buildStoreApplicationCreatedMessage(
            event.data.data(),
            event.time
          )
      });
    }
  );
