export type StoreCustomerStatus = "draft" | "published" | "stopped";

export interface CustomerImage { url: string; storagePath: string; alt: string }
export interface CustomerPrice { id: string; label: string; price: string; note: string }

export interface StoreCustomerPageInput {
  storeId: string;
  status: StoreCustomerStatus;
  enabled: boolean;
  storeName: string;
  category: string;
  description: string;
  address: string;
  station: string;
  businessHours: string;
  closedDay: string;
  phone: string;
  lineUrl: string;
  instagramUrl: string;
  xUrl: string;
  tiktokUrl: string;
  websiteUrl: string;
  externalReservationUrl: string;
  reservationFormEnabled: boolean;
  lineReservationEnabled: boolean;
  phoneReservationEnabled: boolean;
  externalReservationEnabled: boolean;
  prices: CustomerPrice[];
  benefitEnabled: boolean;
  benefitTitle: string;
  benefitContent: string;
  benefitNotes: string;
  benefitConditions: string;
  benefitExpiresAt: string;
  mainImage: CustomerImage | null;
  coverImage: CustomerImage | null;
  galleryImages: CustomerImage[];
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function bool(value: unknown): boolean { return value === true; }
function url(value: unknown): string {
  const candidate = text(value, 2000);
  if (!candidate) return "";
  try { const parsed = new URL(candidate); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; }
}
function id(value: unknown): string {
  const candidate = text(value, 128);
  return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : "";
}
function image(value: unknown): CustomerImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const imageUrl = url(data.url);
  const storagePath = text(data.storagePath, 1000);
  return imageUrl ? { url: imageUrl, storagePath, alt: text(data.alt, 120) } : null;
}

export function parseStoreCustomerPage(value: unknown): StoreCustomerPageInput {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const storeId = id(data.storeId);
  if (!storeId) throw new Error("A valid storeId is required.");
  const status = ["draft", "published", "stopped"].includes(String(data.status)) ? data.status as StoreCustomerStatus : "draft";
  const prices = Array.isArray(data.prices) ? data.prices.slice(0, 30).map((row, index) => {
    const item = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
    return { id: id(item.id) || `price_${index}`, label: text(item.label, 100), price: text(item.price, 100), note: text(item.note, 300) };
  }).filter((row) => row.label || row.price) : [];
  const galleryImages = Array.isArray(data.galleryImages) ? data.galleryImages.slice(0, 20).map(image).filter((item): item is CustomerImage => Boolean(item)) : [];
  return {
    storeId, status, enabled: bool(data.enabled), storeName: text(data.storeName, 160), category: text(data.category, 160),
    description: text(data.description, 8000), address: text(data.address, 500), station: text(data.station, 300),
    businessHours: text(data.businessHours, 500), closedDay: text(data.closedDay, 300), phone: text(data.phone, 100),
    lineUrl: url(data.lineUrl), instagramUrl: url(data.instagramUrl), xUrl: url(data.xUrl), tiktokUrl: url(data.tiktokUrl),
    websiteUrl: url(data.websiteUrl), externalReservationUrl: url(data.externalReservationUrl),
    reservationFormEnabled: bool(data.reservationFormEnabled), lineReservationEnabled: bool(data.lineReservationEnabled),
    phoneReservationEnabled: bool(data.phoneReservationEnabled), externalReservationEnabled: bool(data.externalReservationEnabled),
    prices, benefitEnabled: bool(data.benefitEnabled), benefitTitle: text(data.benefitTitle, 160),
    benefitContent: text(data.benefitContent, 3000), benefitNotes: text(data.benefitNotes, 1000),
    benefitConditions: text(data.benefitConditions, 1000), benefitExpiresAt: text(data.benefitExpiresAt, 10),
    mainImage: image(data.mainImage), coverImage: image(data.coverImage), galleryImages,
  };
}

export function isCustomerPagePublic(data: Record<string, unknown>): boolean {
  return data.enabled === true && data.status === "published";
}

export function composePublicCustomerPage(storeId: string, store: Record<string, unknown>, page: Record<string, unknown>, fallbackGallery: string[]) {
  const string = (...values: unknown[]) => values.find((v) => typeof v === "string" && v.trim()) as string || "";
  const main = image(page.mainImage);
  const cover = image(page.coverImage);
  const gallery = Array.isArray(page.galleryImages) ? page.galleryImages.map(image).filter((item): item is CustomerImage => Boolean(item)) : [];
  return {
    storeId,
    storeName: string(page.storeName, store.storeName, store.name), category: string(page.category, store.businessType, store.category),
    description: string(page.description, store.description, store.introduction), address: string(page.address, store.address),
    station: string(page.station, store.station, store.nearestStation), businessHours: string(page.businessHours, store.businessHours),
    closedDay: string(page.closedDay, store.closedDay), phone: string(page.phone, store.phone, store.tel),
    lineUrl: string(page.lineUrl, store.lineUrl, store.officialLine), instagramUrl: string(page.instagramUrl, store.instagramUrl),
    xUrl: string(page.xUrl, store.xUrl, store.twitterUrl), tiktokUrl: string(page.tiktokUrl, store.tiktokUrl), websiteUrl: string(page.websiteUrl, store.websiteUrl),
    externalReservationUrl: string(page.externalReservationUrl), reservationFormEnabled: page.reservationFormEnabled === true,
    lineReservationEnabled: page.lineReservationEnabled === true, phoneReservationEnabled: page.phoneReservationEnabled === true,
    externalReservationEnabled: page.externalReservationEnabled === true, prices: Array.isArray(page.prices) ? page.prices : [],
    benefitEnabled: page.benefitEnabled === true, benefitTitle: string(page.benefitTitle), benefitContent: string(page.benefitContent),
    benefitNotes: string(page.benefitNotes), benefitConditions: string(page.benefitConditions), benefitExpiresAt: string(page.benefitExpiresAt),
    mainImageUrl: main?.url || string(store.profileImageUrl, store.logoUrl), coverImageUrl: cover?.url || string(store.coverImageUrl, store.mainImageUrl),
    galleryImages: gallery.length ? gallery.map((item) => item.url) : fallbackGallery,
  };
}
