import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { discordTriggerOptions } from "../notifications/discordConfig";
import { buildAmbassadorInquiryCreatedMessage } from "../notifications/discordMessages";
import { processDiscordNotification } from "../notifications/discordNotifier";

export const notifyDiscordOnAmbassadorInquiryCreated = onDocumentCreated(
  { ...discordTriggerOptions, document: "ambassadorInquiries/{inquiryId}" },
  async (event) => {
    if (!event.data) return;
    await processDiscordNotification({
      eventType: "ambassador_inquiry_created",
      sourceCollection: "ambassadorInquiries",
      sourceDocumentPath: event.data.ref.path,
      message: buildAmbassadorInquiryCreatedMessage(
        event.params.inquiryId,
        event.data.data(),
        event.time
      )
    });
  }
);
