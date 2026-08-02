import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

interface AdminDateModule {
  formatTokyoDateInput(value: unknown): string;
  defaultTokyoContractDates(now?: Date): {
    start: string;
    end: string;
  };
}

const adminDate = require(
  path.resolve(__dirname, "../../../pages/admin-date.js"),
) as AdminDateModule;

test("formats the instant before the Tokyo date boundary", () => {
  assert.equal(
    adminDate.formatTokyoDateInput(new Date("2026-08-01T14:59:59.999Z")),
    "2026-08-01",
  );
});

test("formats Tokyo midnight without shifting to the previous day", () => {
  assert.equal(
    adminDate.formatTokyoDateInput(new Date("2026-08-01T15:00:00.000Z")),
    "2026-08-02",
  );
});

test("formats a Firestore-like Timestamp in Tokyo", () => {
  assert.equal(
    adminDate.formatTokyoDateInput({
      toDate: () => new Date("2026-12-31T15:00:00.000Z"),
    }),
    "2027-01-01",
  );
});

test("builds default contract dates from the Tokyo calendar date", () => {
  assert.deepEqual(
    adminDate.defaultTokyoContractDates(
      new Date("2026-12-31T15:30:00.000Z"),
    ),
    {
      start: "2027-01-01",
      end: "2027-02-01",
    },
  );
});
