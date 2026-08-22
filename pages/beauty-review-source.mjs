export function normalizeOptionalSourceUrl(value) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("有効な出典URLを入力してください。");
  }
  if (url.protocol !== "https:") throw new Error("出典URLはHTTPSのみ登録できます。");
  return url.href;
}

export function safeSourceUrl(value) {
  try {
    return normalizeOptionalSourceUrl(value);
  } catch {
    return "";
  }
}
