import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const listScript = readFileSync(
  resolve(__dirname, "../../../pages/ambassadors.js"),
  "utf8"
);
const listStyles = readFileSync(
  resolve(__dirname, "../../../pages/ambassador-list.css"),
  "utf8"
);
const trigger = readFileSync(
  resolve(__dirname, "../../src/triggers/notifyDiscordOnAmbassadorInquiryCreated.ts"),
  "utf8"
);

test("ambassador badges are independent and responsive", () => {
  assert.match(listScript, /amb-badge-recommended/);
  assert.match(listScript, /amb-badge-new/);
  assert.match(listStyles, /\.amb-badges\{[^}]*display:flex/);
  assert.match(listStyles, /gap:8px/);
  assert.match(listStyles, /white-space:nowrap/);
  assert.match(listStyles, /@media\(max-width:480px\)/);
});

test("genres and PR services use separate deduplicated tag groups", () => {
  assert.match(listScript, /得意ジャンル/);
  assert.match(listScript, /対応可能PR/);
  assert.match(listScript, /services=unique\(a\.services\)\.filter/);
  assert.match(listScript, /!genres\.includes\(x\)/);
  assert.match(listScript, /tags\(services\)/);
});

test("inquiry Discord notification runs from a Firestore create trigger", () => {
  assert.match(trigger, /onDocumentCreated/);
  assert.match(trigger, /ambassadorInquiries\/\{inquiryId\}/);
  assert.match(trigger, /processDiscordNotification/);
  assert.doesNotMatch(trigger, /webhook/i);
});
