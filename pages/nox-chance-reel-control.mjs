export const MAX_REEL_SLIP = 4;
export const SERVER_REEL_CODES = Object.freeze(["CHERRY", "STAR", "7", "BAR"]);

const SERVER_CODE_SET = new Set(SERVER_REEL_CODES);

export const REEL_STRIPS = Object.freeze([
  Object.freeze([
    "CHERRY", "STAR", "CHERRY", "7", "BAR", "CHERRY", "STAR",
    "7", "BAR", "CHERRY", "STAR", "7", "BAR", "CHERRY",
    "STAR", "7", "BAR", "CHERRY", "STAR", "7", "BAR",
  ]),
  Object.freeze([
    "7", "BAR", "STAR", "CHERRY", "STAR", "7", "BAR",
    "CHERRY", "STAR", "7", "BAR", "CHERRY", "STAR", "7",
    "BAR", "CHERRY", "STAR", "7", "BAR", "CHERRY", "STAR",
  ]),
  Object.freeze([
    "BAR", "CHERRY", "7", "STAR", "7", "BAR", "CHERRY",
    "STAR", "7", "BAR", "CHERRY", "STAR", "7", "BAR",
    "CHERRY", "STAR", "7", "BAR", "CHERRY", "STAR", "7",
  ]),
]);

export function isServerReelCode(value) {
  return typeof value === "string" && SERVER_CODE_SET.has(value);
}

function normalizeIndex(index, length) {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error("invalid-reel-position");
  }
  return index;
}

function isAccidentalWinningLine(symbols) {
  return symbols.every(isServerReelCode) && symbols.every((symbol) => symbol === symbols[0]);
}

export function chooseReelStop({
  strip,
  currentIndex,
  resultCode,
  targetSymbol,
  reelIndex,
  stoppedSymbols,
}) {
  if (!Array.isArray(strip) || strip.length < 5 || strip.some((code) => !isServerReelCode(code)) ||
      !Number.isInteger(reelIndex) || reelIndex < 0 || reelIndex > 2 ||
      !Array.isArray(stoppedSymbols) || stoppedSymbols.length !== 3) {
    throw new Error("invalid-reel-stop-input");
  }
  const start = normalizeIndex(currentIndex, strip.length);
  const isMiss = resultCode === "miss";
  if (!isMiss && !isServerReelCode(targetSymbol)) {
    throw new Error("invalid-winning-reel-target");
  }

  for (let slip = 0; slip <= MAX_REEL_SLIP; slip += 1) {
    const stopIndex = (start + slip) % strip.length;
    const symbol = strip[stopIndex];
    if (!isMiss && symbol !== targetSymbol) continue;
    if (isMiss) {
      const completed = [...stoppedSymbols];
      completed[reelIndex] = symbol;
      if (isAccidentalWinningLine(completed)) continue;
    }
    return Object.freeze({ stopIndex, slip, symbol });
  }
  throw new Error(isMiss ? "miss-stop-control-unavailable" : "winning-stop-control-unavailable");
}
