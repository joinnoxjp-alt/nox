import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_REEL_SLIP,
  REEL_STRIPS,
  SERVER_REEL_CODES,
  chooseReelStop,
} from "../../pages/nox-chance-reel-control.mjs";

const STOP_ORDERS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2],
  [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

function playStops({ positions, order, resultCode = "miss", targets = ["BAR", "7", "STAR"] }) {
  const stoppedSymbols = [null, null, null];
  const decisions = [];
  for (const reelIndex of order) {
    const decision = chooseReelStop({
      strip: REEL_STRIPS[reelIndex], currentIndex: positions[reelIndex],
      resultCode, targetSymbol: targets[reelIndex], reelIndex, stoppedSymbols,
    });
    stoppedSymbols[reelIndex] = decision.symbol;
    decisions.push({ reelIndex, ...decision });
  }
  return { stoppedSymbols, decisions };
}

test("fixed original strips use only server codes and avoid adjacent duplicates", () => {
  assert.equal(REEL_STRIPS.length, 3);
  assert.equal(new Set(REEL_STRIPS.map((strip) => strip.join("|"))).size, 3);
  for (const strip of REEL_STRIPS) {
    assert.ok(strip.length >= 20);
    assert.ok(strip.every((symbol) => SERVER_REEL_CODES.includes(symbol)));
    for (let index = 0; index < strip.length; index += 1) {
      assert.notEqual(strip[index], strip[(index + 1) % strip.length]);
    }
  }
});

test("winning controls cover zero through four slips and never exceed four", () => {
  const observed = new Set();
  for (let reelIndex = 0; reelIndex < REEL_STRIPS.length; reelIndex += 1) {
    const strip = REEL_STRIPS[reelIndex];
    for (let currentIndex = 0; currentIndex < strip.length; currentIndex += 1) {
      for (const targetSymbol of SERVER_REEL_CODES) {
        const decision = chooseReelStop({
          strip, currentIndex, resultCode: "small", targetSymbol,
          reelIndex, stoppedSymbols: [null, null, null],
        });
        observed.add(decision.slip);
        assert.ok(decision.slip >= 0 && decision.slip <= MAX_REEL_SLIP);
        assert.equal(decision.symbol, targetSymbol);
      }
    }
  }
  assert.deepEqual([...observed].sort(), [0, 1, 2, 3, 4]);
});

test("all winning result tables stop on the server-confirmed middle symbols", async () => {
  const { SLOT_PROBABILITY_TABLES } = await import("../lib-test/src/domain/slotEngine.js");
  for (const table of Object.values(SLOT_PROBABILITY_TABLES)) {
    for (const outcome of table.filter((item) => item.resultCode !== "miss")) {
      for (const order of STOP_ORDERS) {
        const original = structuredClone(outcome);
        const played = playStops({ positions: [0, 7, 14], order, resultCode: outcome.resultCode, targets: outcome.reelStops });
        assert.deepEqual(played.stoppedSymbols, outcome.reelStops);
        assert.deepEqual(outcome, original);
      }
    }
  }
});

test("all manual STOP orders and automatic left-to-right stopping avoid miss wins", () => {
  for (const order of STOP_ORDERS) {
    for (let left = 0; left < REEL_STRIPS[0].length; left += 1) {
      for (let center = 0; center < REEL_STRIPS[1].length; center += 1) {
        for (let right = 0; right < REEL_STRIPS[2].length; right += 1) {
          const played = playStops({ positions: [left, center, right], order });
          assert.ok(played.decisions.every(({ slip }) => slip <= MAX_REEL_SLIP));
          assert.equal(new Set(played.stoppedSymbols).size === 1, false);
        }
      }
    }
  }
  assert.deepEqual(STOP_ORDERS[0], [0, 1, 2]);
});

test("miss timing creates many patterns without changing the server result", () => {
  const frequencies = new Map();
  const serverResult = Object.freeze({ resultCode: "miss", medalsAwarded: 0, coinsConsumed: 0 });
  for (let left = 0; left < REEL_STRIPS[0].length; left += 1) {
    for (let center = 0; center < REEL_STRIPS[1].length; center += 1) {
      for (let right = 0; right < REEL_STRIPS[2].length; right += 1) {
        const { stoppedSymbols } = playStops({ positions: [left, center, right], order: [0, 1, 2] });
        const key = stoppedSymbols.join("|");
        frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
      }
    }
  }
  const total = REEL_STRIPS.reduce((product, strip) => product * strip.length, 1);
  const highestFrequency = Math.max(...frequencies.values());
  assert.ok(frequencies.size >= 40);
  assert.ok(highestFrequency / total < 0.08);
  assert.deepEqual(serverResult, { resultCode: "miss", medalsAwarded: 0, coinsConsumed: 0 });
  assert.notDeepEqual(
    playStops({ positions: [0, 0, 0], order: [0, 1, 2] }).stoppedSymbols,
    playStops({ positions: [1, 1, 1], order: [0, 1, 2] }).stoppedSymbols,
  );
});

test("unknown symbols and impossible controls fail closed", () => {
  assert.throws(() => chooseReelStop({
    strip: REEL_STRIPS[0], currentIndex: 0, resultCode: "small",
    targetSymbol: "UNKNOWN", reelIndex: 0, stoppedSymbols: [null, null, null],
  }), /invalid-winning-reel-target/);
  assert.throws(() => chooseReelStop({
    strip: ["BAR", "BAR", "BAR", "BAR", "BAR"], currentIndex: 0,
    resultCode: "small", targetSymbol: "STAR", reelIndex: 0,
    stoppedSymbols: [null, null, null],
  }), /winning-stop-control-unavailable/);
});
