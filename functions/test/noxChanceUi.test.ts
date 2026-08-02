import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SLOT_PROBABILITY_TABLES } from "../src/domain/slotEngine";

const page = readFileSync(resolve(__dirname, "../../../pages/nox-chance.html"), "utf8");
const script = readFileSync(resolve(__dirname, "../../../pages/nox-chance.js"), "utf8");
const reelControl = readFileSync(
  resolve(__dirname, "../../../pages/nox-chance-reel-control.mjs"),
  "utf8",
);
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

test("every server reel code has a fixed production display mapping", () => {
  const serverCodes = new Set(
    Object.values(SLOT_PROBABILITY_TABLES)
      .flatMap((table) => table.flatMap((outcome) => outcome.reelStops)),
  );
  assert.deepEqual([...serverCodes].sort(), ["7", "BAR", "CHERRY", "STAR"]);
  for (const code of serverCodes) {
    assert.match(reelControl, new RegExp(`"${code}"`));
  }
  assert.match(script, /CHERRY:\s*"🍒"/);
  assert.match(script, /STAR:\s*"★"/);
  assert.match(script, /"7":\s*"7"/);
  assert.match(script, /BAR:\s*"BAR"/);
});

test("all probability outcomes pass server validation and map before rendering", () => {
  for (const table of Object.values(SLOT_PROBABILITY_TABLES)) {
    for (const outcome of table) {
      assert.equal(outcome.reelStops.length, 3);
      assert.ok(outcome.reelStops.every((code) =>
        ["CHERRY", "STAR", "7", "BAR"].includes(code)));
    }
  }
  assert.match(script, /value\.reelStops\.some\(\(symbol\) => !isServerReelCode\(symbol\)\)/);
  assert.match(script, /targetSymbol: round\.result\.reelStops\[index\]/);
  assert.match(script, /symbol\.textContent = SERVER_REEL_TO_DISPLAY\[strip\[index\]\]/);
  assert.doesNotMatch(script, /SERVER_REEL_TO_DISPLAY\[[^\]]+\]\s*\?\?/);
});

test("unknown server reel codes are rejected without a placeholder", () => {
  assert.match(reelControl, /throw new Error\("invalid-winning-reel-target"\)/);
  assert.match(script, /value\.reelStops\.some\(\(symbol\) => !isServerReelCode\(symbol\)\)/);
  assert.doesNotMatch(script + reelControl, /placeholder|UNKNOWN|\?\?\s*["'][^"']+["']/i);
});

test("STOP timing remains presentation-only after the server result is fixed", () => {
  assert.match(script, /const response = await playCallable\(payload\)[\s\S]*beginReelPresentation\(result\)/);
  assert.match(script, /chooseReelStop\([\s\S]*resultCode: round\.result\.resultCode/);
  assert.doesNotMatch(reelControl, /medalsAwarded|coinsConsumed|freePlays|httpsCallable|fetch\(/);
  assert.doesNotMatch(script + reelControl, /Math\.random|getRandomValues|weight\s*:/);
  assert.match(script, /schedule\(\(\) => stopReel\(index, currentRound\)/);
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
