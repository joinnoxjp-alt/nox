export const MARKET_CATEGORIES = ["バッグ", "ドレス", "洋服", "アクセサリー", "シューズ", "ブランド品", "美容・コスメ", "その他"];

export const MARKET_CONDITIONS = ["新品・未使用", "未使用に近い", "目立った傷や汚れなし", "やや傷や汚れあり", "傷や汚れあり"];

export const DONATION_STATUSES = ["申請受付", "発送待ち", "到着済み", "検品中", "販売準備中", "販売中", "販売済み", "受付不可"];

export const MARKET_NOTICE = "NOX MARKETでは、現在中古品の買取・委託販売は行っておりません。不要品を完全無償で譲渡いただく形でのみ受付しております。発送時の送料は提供者様のご負担となります。商品到着後の所有権はNOXへ移転し、販売後の売上はすべてNOXに帰属します。提供者様への売上分配・謝礼・ポイント・その他金銭的な還元は一切ございません。";

export const AGREEMENTS = [
  "本商品をNOXへ完全無償で譲渡することに同意します",
  "発送時の送料は提供者自身が負担することに同意します",
  "商品到着後、商品の所有権がNOXへ移転することに同意します",
  "譲渡後の商品について、NOXが販売・再利用・処分等を行うことに同意します",
  "商品が販売された場合でも、売上分配・謝礼・ポイント・その他金銭的な還元がないことに同意します",
  "自身が正当に所有している商品であり、盗品・偽造品等ではありません"
];

export const yen = value => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(Number(value) || 0);
export const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
export const safeImageUrl = value => typeof value === "string" && /^https:\/\//i.test(value) ? value : "";
export const formatDate = value => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date) : "—";
};
