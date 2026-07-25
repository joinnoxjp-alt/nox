export type DiscordNotificationType =
  | "user_created"
  | "job_application_created"
  | "store_application_created";

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
    | "storeApplications";
  sourceDocumentPath: string;
  message: DiscordMessage;
}

export interface NotificationProcessResult {
  status:
    | "sent"
    | "failed"
    | "duplicate";
}
