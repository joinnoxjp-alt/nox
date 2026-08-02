export function normalizeJapanesePhoneNumber(value) {
  const compact = String(value ?? "").trim().replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^0\d{9,10}$/.test(compact)) return `+81${compact.slice(1)}`;
  throw new Error("invalid-phone-number");
}

export function describePhoneVerificationError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const messages = {
    "auth/invalid-phone-number": "電話番号を正しく入力してください。",
    "auth/missing-phone-number": "電話番号を入力してください。",
    "auth/too-many-requests": "送信回数が上限に達しました。時間をおいてお試しください。",
    "auth/quota-exceeded": "SMS送信の上限に達しました。時間をおいてお試しください。",
    "auth/invalid-verification-code": "確認コードが正しくありません。",
    "auth/code-expired": "確認コードの期限が切れました。SMSを再送してください。",
    "auth/credential-already-in-use": "この電話番号は別のアカウントで使用されています。",
    "auth/provider-already-linked": "このアカウントはすでにSMS認証済みです。",
    "auth/requires-recent-login": "安全のため、ログインし直してからお試しください。",
    "functions/already-exists": "この電話番号は別の会員アカウントで認証済みです。",
    "functions/failed-precondition": "会員情報またはSMS認証状態を確認できませんでした。",
    "functions/permission-denied": "この会員アカウントではSMS認証を利用できません。",
    "nox/sms-rate-limit": "SMS送信は15分間に3回までです。時間をおいてお試しください。",
    "auth/operation-not-allowed": "現在SMS認証を利用できません。運営へお問い合わせください。",
    "auth/captcha-check-failed": "reCAPTCHAの確認に失敗しました。もう一度お試しください。",
  };
  return messages[code] || "SMS認証に失敗しました。時間をおいてお試しください。";
}

export function shouldRollbackLinkedPhoneCredential(error) {
  return new Set([
    "functions/already-exists",
    "functions/invalid-argument",
    "functions/failed-precondition",
    "functions/permission-denied",
  ]).has(typeof error?.code === "string" ? error.code : "");
}
