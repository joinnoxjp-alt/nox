import {
  Timestamp
} from "firebase-admin/firestore";

import {
  DiscordMessage
} from "../types/discordNotification";

const ADMIN_URL =
  "https://joinnox.jp/pages/admin.html";
const MAX_FIELD_LENGTH = 180;

function safeText(
  value: unknown,
  fallback = "未入力"
): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, MAX_FIELD_LENGTH);
}

function dateFromValue(
  value: unknown,
  fallbackIsoTime: string
): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const converted = value.toDate();
    if (
      converted instanceof Date &&
      !Number.isNaN(converted.getTime())
    ) {
      return converted;
    }
  }
  const fallback = new Date(fallbackIsoTime);
  return Number.isNaN(fallback.getTime())
    ? new Date(0)
    : fallback;
}

function formatJapanTime(
  value: unknown,
  fallbackIsoTime: string
): string {
  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  ).format(
    dateFromValue(value, fallbackIsoTime)
  );
}

function businessScopeLabel(
  value: unknown
): string {
  const labels: Record<string, string> = {
    night: "夜職",
    general: "一般求人",
    both: "両方"
  };
  return typeof value === "string"
    ? labels[value] ?? "不明"
    : "不明";
}

function message(content: string): DiscordMessage {
  return {
    content: content.slice(0, 2000),
    allowed_mentions: {
      parse: []
    }
  };
}

export function buildUserCreatedMessage(
  data: Record<string, unknown>,
  eventTime: string
): DiscordMessage {
  return message([
    "👤 新規会員登録",
    "",
    "ユーザー種別：一般会員",
    `表示名：${safeText(
      data.nickname ?? data.name
    )}`,
    `登録日時：${formatJapanTime(
      data.createdAt,
      eventTime
    )}`
  ].join("\n"));
}

export function buildJobApplicationCreatedMessage(
  data: Record<string, unknown>,
  eventTime: string
): DiscordMessage {
  return message([
    "📄 新しい求人掲載申請",
    "",
    `店舗名：${safeText(data.storeName)}`,
    `掲載区分：${businessScopeLabel(
      data.businessScope
    )}`,
    `求人タイトル：${safeText(
      data.position ?? data.jobType
    )}`,
    `業種：${safeText(data.businessType)}`,
    `エリア：${safeText(data.area)}`,
    `申請日時：${formatJapanTime(
      data.createdAt,
      eventTime
    )}`,
    "",
    `管理画面：${ADMIN_URL}`
  ].join("\n"));
}

export function buildStoreApplicationCreatedMessage(
  data: Record<string, unknown>,
  eventTime: string
): DiscordMessage {
  return message([
    "🏪 店舗掲載申請",
    "",
    `店舗名：${safeText(data.storeName)}`,
    `掲載区分：${businessScopeLabel(
      data.businessScope
    )}`,
    `業種：${safeText(data.businessType)}`,
    `エリア：${safeText(data.area)}`,
    `担当者名：${safeText(data.contactName)}`,
    `メール：${safeText(data.contactEmail)}`,
    `電話番号：${safeText(data.contactPhone)}`,
    `申請日時：${formatJapanTime(
      data.createdAt,
      eventTime
    )}`,
    "",
    `管理画面：${ADMIN_URL}`
  ].join("\n"));
}
