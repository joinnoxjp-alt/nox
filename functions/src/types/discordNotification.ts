export type DiscordNotificationType =
  | "user_created"
  | "job_application_created"
  | "store_application_created"
  | "store_review_created"
  | "applicant_created"
  | "store_reservation_created"
  | "ambassador_inquiry_created";

export type DiscordNotificationStatus =
  | "processing"
  | "sent"
  | "failed";

export interface DiscordMessage {
  content: string;
  allowed_mentions: {
    parse: [];
  };
}

export interface NotificationProcessInput {
  eventType: DiscordNotificationType;
  sourceCollection:
    | "users"
    | "jobApplications"
    | "storeApplications"
    | "storeReviews"
    | "applications"
    | "storeReservations"
    | "ambassadorInquiries";
  sourceDocumentPath: string;
  message: DiscordMessage;
}

export interface NotificationProcessResult {
  status:
    | "sent"
    | "failed"
    | "duplicate";
}
