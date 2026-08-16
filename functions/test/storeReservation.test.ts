import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReservationRecord,
  NOX_RESERVATION_MESSAGE,
  NOX_RESERVATION_SOURCE,
  NOX_RESERVATION_SOURCE_LABEL,
  optionalDocumentId,
} from "../src/domain/storeReservation";

const base = {
  reservationId: "reservation-1",
  storeId: "aCtKyqRJmPskKwxAEDTv",
  storeName: "Bar 8 ～Eight～",
  jobId: "PLwZwgvysKZAHwSsBrfL",
  name: "テスト予約",
  phone: "00000000000",
  desiredDate: "2026-08-17",
  desiredTime: "21:20",
  people: 1,
  content: "席予約",
  notes: "テスト",
};

test("NOX form reservations always carry canonical source fields", () => {
  const record = buildReservationRecord({ ...base, page: {} });
  assert.equal(record.reservationId, "reservation-1");
  assert.equal(record.source, NOX_RESERVATION_SOURCE);
  assert.equal(record.sourceLabel, NOX_RESERVATION_SOURCE_LABEL);
  assert.equal(record.fromNox, true);
  assert.equal(record.noxMessage, NOX_RESERVATION_MESSAGE);
  assert.equal(record.status, "new");
  assert.equal(record.jobId, "PLwZwgvysKZAHwSsBrfL");
});

test("Bar 8 benefit is snapshotted using server-side page fields", () => {
  const record = buildReservationRecord({
    ...base,
    page: {
      benefitEnabled: true,
      benefitTitle: "NOX限定！3時間飲み放題3,000円",
      benefitContent: "料金そのまま3時間飲み放題",
      benefitConditions: "NOXを見たと伝える",
      benefitNotes: "併用不可",
    },
  });
  assert.equal(record.benefitEligible, true);
  assert.equal(record.benefitTitle, "NOX限定！3時間飲み放題3,000円");
  assert.equal(record.benefitCondition, "NOXを見たと伝える");
  assert.equal(record.benefitNotice, "併用不可");
});

test("disabled benefits remain ineligible and optional job IDs are validated", () => {
  const record = buildReservationRecord({ ...base, jobId: "", page: { benefitEnabled: false, benefitTitle: "信用しない" } });
  assert.equal(record.benefitEligible, false);
  assert.equal(record.benefitTitle, "");
  assert.equal(optionalDocumentId("valid_job-1"), "valid_job-1");
  assert.equal(optionalDocumentId("invalid/id"), "");
});

test("reservation notification is isolated in a Firestore create trigger", () => {
  const trigger = readFileSync(resolve(__dirname, "../../src/triggers/notifyDiscordOnStoreReservationCreated.ts"), "utf8");
  const callable = readFileSync(resolve(__dirname, "../../src/callable/submitStoreReservation.ts"), "utf8");
  assert.match(trigger, /storeReservations\/\{reservationId\}/);
  assert.match(trigger, /processDiscordNotification/);
  assert.doesNotMatch(callable, /sendDiscordMessage|processDiscordNotification/);
  assert.match(callable, /storeReservationDedupe/);
  assert.match(callable, /runTransaction/);
});
