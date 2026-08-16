export const NOX_RESERVATION_SOURCE = "nox_reservation";
export const NOX_RESERVATION_SOURCE_LABEL = "NOXを見た";
export const NOX_RESERVATION_MESSAGE = "「NOXを見た」でのご予約です。";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function optionalDocumentId(value: unknown): string {
  const candidate = text(value, 128);
  return candidate && /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : "";
}

export function buildReservationRecord(input: {
  reservationId: string;
  storeId: string;
  storeName: string;
  jobId: string;
  name: string;
  phone: string;
  desiredDate: string;
  desiredTime: string;
  people: number;
  content: unknown;
  notes: unknown;
  page: Record<string, unknown>;
}) {
  const benefitEligible = input.page.benefitEnabled === true;
  return {
    reservationId: input.reservationId,
    storeId: input.storeId,
    storeName: input.storeName,
    name: input.name,
    phone: input.phone,
    desiredDate: input.desiredDate,
    desiredTime: input.desiredTime,
    people: input.people,
    content: text(input.content, 1000),
    notes: text(input.notes, 1000),
    status: "new",
    jobId: input.jobId,
    source: NOX_RESERVATION_SOURCE,
    sourceLabel: NOX_RESERVATION_SOURCE_LABEL,
    fromNox: true,
    noxMessage: NOX_RESERVATION_MESSAGE,
    benefitEligible,
    benefitTitle: benefitEligible ? text(input.page.benefitTitle, 160) : "",
    benefitContent: benefitEligible ? text(input.page.benefitContent, 3000) : "",
    benefitCondition: benefitEligible ? text(input.page.benefitConditions, 1000) : "",
    benefitNotice: benefitEligible ? text(input.page.benefitNotes, 1000) : "",
  };
}
