import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "../../../pages/nox-chance.html"), "utf8");
const script = readFileSync(resolve(__dirname, "../../../pages/nox-chance.js"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../../pages/nox-chance.css"), "utf8");
const statusCallable = readFileSync(
  resolve(__dirname, "../src/callable/getNoxChanceStatus.js"),
  "utf8",
);

test("production page is separate from local demo controls", () => {
  assert.doesNotMatch(page, /LOCAL DEMO|CREDITを50|大当たり確定|試し打ち設定/);
  assert.doesNotMatch(page, /nox-chance-preview/);
  assert.match(page, /1回10コイン/);
  assert.match(page, /有効期限は付与から180日/);
  assert.match(page, /月例プレゼントとは無関係/);
});

test("browser calls only the two trusted slot callables", () => {
  assert.match(script, /httpsCallable\(functions, "getNoxChanceStatus"\)/);
  assert.match(script, /httpsCallable\(functions, "playNoxChanceSlot"\)/);
  assert.doesNotMatch(script, /getFirestore|collection\(|doc\(|coinWallets|coinLots|slotPlayerStates|slotPlays/);
});

test("member payload sends only a request ID", () => {
  assert.match(script, /:\s*\{ requestId: request\.requestId \}/);
  for (const field of ["resultCode", "reelStops", "medalsAwarded", "weight", "phoneIdentity"]) {
    assert.doesNotMatch(script, new RegExp(`payload[^;]*${field}`));
  }
});

test("production browser contains no outcome RNG or probability weights", () => {
  assert.doesNotMatch(script, /Math\.random|getRandomValues|weight\s*:|SLOT_PROBABILITY|probability table/i);
  assert.match(script, /crypto\.randomUUID/);
});

test("uncertain requests are recoverable only with the same session request ID", () => {
  assert.match(script, /noxChancePendingPlayV1/);
  assert.match(script, /requestId:\s*value\.requestId[\s\S]*startedAt:\s*value\.startedAt/);
  assert.match(script, /requestPlay\(pendingPlay\)/);
  assert.doesNotMatch(script, /localStorage/);
});

test("lever and reel controls support pointer, keyboard, mobile, and reduced motion", () => {
  assert.match(page, /role="button"[\s\S]*tabindex="-1"/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointermove/);
  assert.match(script, /event\.key !== "Enter" && event\.key !== " "/);
  assert.doesNotMatch(script, /touchstart|mousedown/);
  assert.match(styles, /touch-action:none/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /max-width:520px/);
});

test("operator choices are gated by server status", () => {
  assert.match(script, /operatorPanel\.hidden = !operator/);
  assert.match(script, /currentStatus\?\.isOperatorTestAvailable/);
  assert.match(script, /probabilityProfile: operatorProfile\(\)/);
  assert.match(statusCallable, /assertActiveAdmin\)\(request\.auth\)/);
  assert.match(statusCallable, /isOperatorTestAvailable:\s*true/);
});

test("user-facing errors do not expose internal identity or paths", () => {
  assert.match(script, /functions\/unavailable/);
  assert.match(script, /functions\/permission-denied/);
  assert.doesNotMatch(page + script, /phoneIdentity|HMAC|coinLots\//);
});
