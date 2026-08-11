import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { discordTriggerOptions } from "../notifications/discordConfig";
import { buildApplicantCreatedMessage } from "../notifications/discordMessages";
import { processDiscordNotification } from "../notifications/discordNotifier";

export const notifyDiscordOnApplicantCreated = onDocumentCreated(
  { ...discordTriggerOptions, document: "applications/{applicationId}" },
  async (event) => {
    if (!event.data) return;
    await processDiscordNotification({
      eventType: "applicant_created",
      sourceCollection: "applications",
      sourceDocumentPath: event.data.ref.path,
      message: buildApplicantCreatedMessage(
        event.params.applicationId, event.data.data(), event.time
      )
    });
  }
);
