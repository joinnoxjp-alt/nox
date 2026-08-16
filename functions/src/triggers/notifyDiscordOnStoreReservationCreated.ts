import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { discordTriggerOptions } from "../notifications/discordConfig";
import { buildStoreReservationCreatedMessage } from "../notifications/discordMessages";
import { processDiscordNotification } from "../notifications/discordNotifier";

export const notifyDiscordOnStoreReservationCreated = onDocumentCreated(
  { ...discordTriggerOptions, document: "storeReservations/{reservationId}" },
  async (event) => {
    if (!event.data) return;
    await processDiscordNotification({
      eventType: "store_reservation_created",
      sourceCollection: "storeReservations",
      sourceDocumentPath: event.data.ref.path,
      message: buildStoreReservationCreatedMessage(
        event.params.reservationId,
        event.data.data(),
        event.time
      )
    });
  }
);
