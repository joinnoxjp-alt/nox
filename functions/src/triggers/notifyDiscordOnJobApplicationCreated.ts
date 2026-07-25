import {
  onDocumentCreated
} from "firebase-functions/v2/firestore";

import {
  discordTriggerOptions
} from "../config";
import {
  buildJobApplicationCreatedMessage
} from "../notifications/discordMessages";
import {
  processDiscordNotification
} from "../notifications/discordNotifier";

export const notifyDiscordOnJobApplicationCreated =
  onDocumentCreated(
    {
      ...discordTriggerOptions,
      document:
        "jobApplications/{applicationId}"
    },
    async (event) => {
      if (!event.data) {
        return;
      }
      await processDiscordNotification({
        eventType:
          "job_application_created",
        sourceCollection:
          "jobApplications",
        sourceDocumentPath:
          event.data.ref.path,
        message:
          buildJobApplicationCreatedMessage(
            event.data.data(),
            event.time
          )
      });
    }
  );
