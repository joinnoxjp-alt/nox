import { auth } from "./firebase-db.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  REEL_STRIPS,
  SERVER_REEL_CODES,
  chooseReelStop,
  isServerReelCode,
} from "./nox-chance-reel-control.mjs";

const functions = getFunctions(auth.app, "asia-northeast1");
const getStatusCallable = httpsCallable(functions, "getNoxChanceStatus");
const playCallable = httpsCallable(functions, "playNoxChanceSlot");
const PENDING_KEY = "noxChancePendingPlayV1";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const SERVER_REEL_TO_DISPLAY = Object.freeze({
  CHERRY: "🍒",
  STAR: "★",
  "7": "7",
  BAR: "BAR",
});
if (SERVER_REEL_CODES.some((code) => !Object.hasOwn(SERVER_REEL_TO_DISPLAY, code))) {
  throw new Error("incomplete-server-reel-display-map");
}
const RESULT_LABELS = { miss: "はずれ", small: "小当たり", medium: "中当たり", jackpot: "大当たり" };
const AUTO_STOP_DELAYS = [2600, 3500, 4400];
const LEVER_MAX = 82;
const LEVER_TRIGGER = 66;

const machine = document.querySelector("#machine");
const reels = [...document.querySelectorAll(".reel")];
const stops = [...document.querySelectorAll(".stop-button")];
const lever = document.querySelector("#start-lever");
const leverHint = document.querySelector("#lever-hint");
const retryButton = document.querySelector("#retry-result");
const authMessage = document.querySelector("#auth-message");
const authAction = document.querySelector("#auth-action");
const freeCount = document.querySelector("#free-count");
const coinCount = document.querySelector("#coin-count");
const medalBalance = document.querySelector("#balance-medals");
const nextPlay = document.querySelector("#next-play");
const trialNotice = document.querySelector("#trial-notice");
const frozenNotice = document.querySelector("#frozen-notice");
const operatorPanel = document.querySelector("#operator-panel");
const gameStatus = document.querySelector("#game-status");
const resultLabel = document.querySelector("#result-label");
const resultMedals = document.querySelector("#result-medals span");
const lamp = document.querySelector("#chance-lamp");
const bgmStatus = document.querySelector("#bgm-status");
const soundButton = document.querySelector("#sound-toggle");
const volumeSlider = document.querySelector("#volume-slider");
const volumeValue = document.querySelector("#volume-value");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

let currentUser = null;
let currentStatus = null;
let currentRound = null;
let pendingPlay = readPendingPlay();
let stalePending = false;
let leverGesture = null;
let lastStatusAt = 0;
let soundEnabled = true;
let audioContext = null;
let masterGain = null;
const timers = new Set();
const spinSources = new Set();
const effectSources = new Set();
const bgmSources = new Set();
const audioTimers = new Set();

function readPendingPlay() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    if (!value || typeof value.requestId !== "string" ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(value.requestId) ||
        !Number.isFinite(value.startedAt)) return null;
    return { requestId: value.requestId, startedAt: value.startedAt };
  } catch { return null; }
}

function savePendingPlay(value) {
  pendingPlay = value;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({
    requestId: value.requestId,
    startedAt: value.startedAt,
  }));
}

function clearPendingPlay() {
  pendingPlay = null;
  sessionStorage.removeItem(PENDING_KEY);
}

function schedule(callback, delay) {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timers.add(timer);
  return timer;
}

function clearTimer(timer) {
  if (timer == null) return;
  clearTimeout(timer); clearInterval(timer); timers.delete(timer);
}

function setMessage(message, kind = "") {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${kind}`.trim();
}

function safeErrorMessage(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return ({
    "functions/unauthenticated": "ログインが必要です。",
    "functions/permission-denied": "このアカウントではNOX CHANCEを利用できません。SMS認証と会員状態をご確認ください。",
    "functions/failed-precondition": "残高不足またはアカウント状態によりプレイできません。",
    "functions/resource-exhausted": "アクセスが集中しています。同じ操作の結果を再確認してください。",
    "functions/unavailable": "通信が不安定です。同じ操作の結果を再確認してください。",
    "functions/internal": "結果を確認できませんでした。同じ操作の結果を再確認してください。",
  })[code] || "NOX CHANCEを現在利用できません。";
}

function isUncertainError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return ![
    "functions/unauthenticated",
    "functions/permission-denied",
    "functions/failed-precondition",
    "functions/invalid-argument",
  ].includes(code);
}

function renderWindow(reelIndex, centerIndex) {
  const strip = REEL_STRIPS[reelIndex];
  const indexes = [(centerIndex - 1 + strip.length) % strip.length, centerIndex, (centerIndex + 1) % strip.length];
  reels[reelIndex].replaceChildren(...indexes.map((index) => {
    const symbol = document.createElement("span");
    symbol.className = "reel-symbol";
    symbol.textContent = SERVER_REEL_TO_DISPLAY[strip[index]];
    return symbol;
  }));
}

function validatePlayResult(value) {
  if (!value || typeof value !== "object" || !/^[a-f0-9]{64}$/.test(String(value.playId)) ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(String(value.requestId)) ||
      !Object.hasOwn(RESULT_LABELS, value.resultCode) || !Array.isArray(value.reelStops) ||
      value.reelStops.length !== 3 ||
      value.reelStops.some((symbol) => !isServerReelCode(symbol)) ||
      !Number.isSafeInteger(value.medalsAwarded) || value.medalsAwarded < 0 || value.medalsAwarded > 5000) {
    throw new Error("invalid-server-play-result");
  }
  return value;
}

function isPlayable() {
  if (!currentStatus || currentRound || pendingPlay || stalePending || currentStatus.accountFrozen) return false;
  if (currentStatus.isOperatorTestAvailable) return true;
  return currentStatus.smsVerified &&
    (currentStatus.nextPlayKind === "free" || currentStatus.availableCoinBalance >= 10);
}

function updateControls() {
  const enabled = isPlayable();
  lever.classList.toggle("is-locked", !enabled);
  lever.setAttribute("aria-disabled", String(!enabled));
  lever.tabIndex = enabled ? 0 : -1;
  machine.classList.toggle("is-locked", !enabled && !currentRound);
  if (currentRound?.phase === "requesting") leverHint.textContent = "抽選中";
  else if (pendingPlay) leverHint.textContent = "結果確認待ち";
  else if (currentStatus?.accountFrozen) leverHint.textContent = "凍結中";
  else if (currentStatus && currentStatus.nextPlayKind === "paid" && currentStatus.availableCoinBalance < 10) leverHint.textContent = "コイン不足";
  else leverHint.textContent = enabled ? "PULL TO START" : "利用できません";
  retryButton.hidden = !pendingPlay || stalePending || currentRound !== null;
}

function renderStatus(status) {
  currentStatus = status;
  const operator = status.isOperatorTestAvailable === true;
  operatorPanel.hidden = !operator;
  freeCount.textContent = operator ? "∞" : Number(status.freePlaysRemaining).toLocaleString("ja-JP");
  coinCount.textContent = operator ? "無消費" : Number(status.availableCoinBalance).toLocaleString("ja-JP");
  medalBalance.textContent = operator ? "無消費" : Number(status.medalBalance).toLocaleString("ja-JP");
  nextPlay.textContent = operator ? "運営テスト" : status.nextPlayKind === "free" ? "無料体験" : "10コイン使用";
  trialNotice.hidden = operator || status.nextPlayKind !== "free";
  frozenNotice.hidden = status.accountFrozen !== true;
  setMessage(operator ? "管理者テストモードが利用できます。" : "NOX CHANCEを利用できます。", "success");
  lastStatusAt = Date.now();
  updateControls();
}

async function refreshStatus() {
  if (!currentUser) return;
  setMessage("利用状態を確認しています…");
  try {
    const response = await getStatusCallable({});
    renderStatus(response.data);
  } catch (error) {
    currentStatus = null;
    setMessage(safeErrorMessage(error), "error");
    if (!currentUser.phoneNumber) {
      authAction.href = "./phone-verification.html";
      authAction.textContent = "SMS認証へ進む";
      authAction.hidden = false;
    }
    updateControls();
  }
}

function createRequestId() {
  if (typeof crypto.randomUUID !== "function") throw new Error("secure-request-id-unavailable");
  return `slot_${crypto.randomUUID().replaceAll("-", "_")}`;
}

function operatorProfile() {
  return document.querySelector('input[name="operator-profile"]:checked')?.value || "standard";
}

async function requestPlay(request) {
  currentRound = { phase: "requesting", requestId: request.requestId };
  savePendingPlay(request);
  resultLabel.textContent = "サーバーで抽選中…";
  gameStatus.textContent = "通信中";
  stops.forEach((button) => { button.disabled = true; });
  updateControls();
  try {
    const payload = currentStatus?.isOperatorTestAvailable
      ? { requestId: request.requestId, probabilityProfile: operatorProfile() }
      : { requestId: request.requestId };
    const response = await playCallable(payload);
    const result = validatePlayResult(response.data);
    if (result.requestId !== request.requestId) throw new Error("mismatched-server-request-id");
    clearPendingPlay();
    beginReelPresentation(result);
  } catch (error) {
    currentRound = null;
    resultLabel.textContent = safeErrorMessage(error);
    gameStatus.textContent = isUncertainError(error) ? "結果未確認" : "プレイ不可";
    if (!isUncertainError(error)) clearPendingPlay();
    updateControls();
  }
}

function beginReelPresentation(result) {
  currentRound = {
    phase: "spinning", result, states: ["spinning", "spinning", "spinning"],
    positions: [1, 3, 5], stoppedSymbols: [null, null, null],
    intervals: [null, null, null], autoTimers: [null, null, null], finished: false,
  };
  gameStatus.textContent = result.resultCode === "miss" ? "通常遊技" : "NOX CHANCE";
  resultLabel.textContent = "STOPボタンでリールを停止";
  resultMedals.textContent = "0";
  resetEffects();
  stopAllAudio();
  playStartSound(); startSpinLoop();
  if (result.resultCode !== "miss") {
    lamp.classList.add("is-lit", `is-${result.resultCode}`);
    playAdvanceNotice(result.resultCode);
  }
  reels.forEach((reel, index) => {
    reel.classList.add("is-spinning"); stops[index].disabled = false;
    const interval = setInterval(() => {
      if (currentRound?.phase !== "spinning" || currentRound.states[index] !== "spinning") return;
      currentRound.positions[index] = (currentRound.positions[index] + 1) % REEL_STRIPS[index].length;
      renderWindow(index, currentRound.positions[index]);
    }, reducedMotion.matches ? 150 : 72 + index * 5);
    timers.add(interval); currentRound.intervals[index] = interval;
    currentRound.autoTimers[index] = schedule(() => stopReel(index, currentRound),
      reducedMotion.matches ? 700 + index * 180 : AUTO_STOP_DELAYS[index]);
  });
  updateControls();
}

function stopReel(index, round) {
  if (currentRound !== round || round.phase !== "spinning" || round.states[index] !== "spinning") return;
  round.states[index] = "stopping"; stops[index].disabled = true;
  clearTimer(round.intervals[index]); clearTimer(round.autoTimers[index]);
  reels[index].classList.remove("is-spinning"); reels[index].classList.add("is-braking");
  playStopSound(index);
  const decision = chooseReelStop({
    strip: REEL_STRIPS[index], currentIndex: round.positions[index],
    resultCode: round.result.resultCode, targetSymbol: round.result.reelStops[index],
    reelIndex: index, stoppedSymbols: round.stoppedSymbols,
  });
  const finishStop = () => {
    if (currentRound !== round) return;
    round.positions[index] = decision.stopIndex;
    round.stoppedSymbols[index] = decision.symbol;
    renderWindow(index, decision.stopIndex);
    reels[index].classList.remove("is-braking"); round.states[index] = "stopped";
    if (round.states.every((state) => state === "stopped")) finishPresentation(round);
  };
  if (decision.slip === 0) {
    schedule(finishStop, reducedMotion.matches ? 20 : 45);
    return;
  }
  let completedSlip = 0;
  const advanceSlip = () => {
    if (currentRound !== round) return;
    round.positions[index] = (round.positions[index] + 1) % REEL_STRIPS[index].length;
    renderWindow(index, round.positions[index]);
    completedSlip += 1;
    if (completedSlip === decision.slip) {
      finishStop();
      return;
    }
    schedule(advanceSlip, reducedMotion.matches ? 18 : 50 + completedSlip * 28);
  };
  schedule(advanceSlip, reducedMotion.matches ? 18 : 50);
}

function finishPresentation(round) {
  if (currentRound !== round || round.finished) return;
  round.finished = true; stopSources(spinSources);
  const result = round.result;
  resultLabel.textContent = result.resultCode === "miss" ? "はずれ" : `${RESULT_LABELS[result.resultCode]} ${result.medalsAwarded.toLocaleString("ja-JP")} MEDALS`;
  resultMedals.textContent = result.medalsAwarded.toLocaleString("ja-JP");
  if (result.resultCode === "miss") playMissSound();
  else {
    playWinBgm(result.resultCode);
    if (result.resultCode === "jackpot") machine.classList.add("is-hit", "is-jackpot");
  }
  schedule(async () => {
    if (currentRound !== round) return;
    machine.classList.remove("is-hit", "is-jackpot"); currentRound = null;
    await refreshStatus();
    lever.focus({ preventScroll: true });
  }, reducedMotion.matches ? 100 : result.resultCode === "jackpot" ? 1850 : 650);
}

function resetEffects() { lamp.classList.remove("is-lit", "is-small", "is-medium", "is-jackpot"); machine.classList.remove("is-hit", "is-jackpot"); }

function setPull(distance, returning = false) {
  const pull = Math.min(LEVER_MAX, Math.max(0, distance));
  lever.style.setProperty("--pull", `${pull}px`);
  lever.classList.toggle("is-near", pull >= LEVER_TRIGGER * .78);
  lever.classList.toggle("is-returning", returning);
}

function releaseLever(event) {
  if (!leverGesture || event.pointerId !== leverGesture.pointerId) return;
  const pointerId = leverGesture.pointerId; leverGesture = null;
  if (lever.hasPointerCapture?.(pointerId)) lever.releasePointerCapture(pointerId);
  setPull(0, true); schedule(() => lever.classList.remove("is-returning"), reducedMotion.matches ? 20 : 280);
}

function activateLever() {
  if (!isPlayable()) return;
  const request = { requestId: createRequestId(), startedAt: Date.now() };
  if (typeof navigator.vibrate === "function" && !reducedMotion.matches) navigator.vibrate(24);
  requestPlay(request);
}

lever.addEventListener("pointerdown", (event) => {
  if (!isPlayable() || leverGesture) return;
  leverGesture = { pointerId: event.pointerId, startY: event.clientY, triggered: false };
  lever.setPointerCapture(event.pointerId); lever.classList.remove("is-returning"); setPull(0);
});
lever.addEventListener("pointermove", (event) => {
  if (!leverGesture || event.pointerId !== leverGesture.pointerId) return;
  event.preventDefault();
  const distance = Math.max(0, event.clientY - leverGesture.startY); setPull(distance);
  if (!leverGesture.triggered && distance >= LEVER_TRIGGER) {
    leverGesture.triggered = true; setPull(LEVER_MAX); activateLever();
  }
});
lever.addEventListener("pointerup", releaseLever); lever.addEventListener("pointercancel", releaseLever);
lever.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault(); if (!isPlayable()) return;
  setPull(LEVER_MAX); activateLever(); schedule(() => setPull(0, true), 180);
});
stops.forEach((button, index) => button.addEventListener("click", () => currentRound && stopReel(index, currentRound)));
retryButton.addEventListener("click", () => { if (pendingPlay && !stalePending && !currentRound) requestPlay(pendingPlay); });

function ensureAudio() {
  if (!soundEnabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) { audioContext = new AudioContextClass(); masterGain = audioContext.createGain(); masterGain.gain.value = Number(volumeSlider.value) / 100; masterGain.connect(audioContext.destination); }
  if (audioContext.state === "suspended") audioContext.resume().catch(() => undefined);
  return audioContext;
}
function stopSources(sources) { for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); } sources.clear(); }
function stopAllAudio() { stopSources(spinSources); stopSources(effectSources); stopSources(bgmSources); for (const timer of audioTimers) clearTimeout(timer); audioTimers.clear(); bgmStatus.hidden = true; }
function tone(sources, frequency, duration, delay = 0, type = "triangle", volume = .1, cutoff = 2200) {
  const context = ensureAudio(); if (!context || !masterGain) return;
  const at = context.currentTime + delay / 1000; const oscillator = context.createOscillator(); const gain = context.createGain(); const filter = context.createBiquadFilter();
  oscillator.type = type; oscillator.frequency.value = frequency; filter.type = "lowpass"; filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(filter).connect(gain).connect(masterGain); sources.add(oscillator); oscillator.onended = () => sources.delete(oscillator); oscillator.start(at); oscillator.stop(at + duration + .025);
}
function playStartSound() { tone(effectSources,146,.08,0,"square",.045); tone(effectSources,233,.13,75,"triangle",.075); }
function startSpinLoop() { const context = ensureAudio(); if (!context || !masterGain) return; const oscillator=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter(); oscillator.type="sawtooth";oscillator.frequency.value=58;filter.type="lowpass";filter.frequency.value=240;gain.gain.value=.028;oscillator.connect(filter).connect(gain).connect(masterGain);spinSources.add(oscillator);oscillator.start(); }
function playStopSound(index) { tone(effectSources,190+index*47,.075,0,"square",.06,1500); }
function playMissSound() { tone(effectSources,196,.1,0,"sine",.045,900); tone(effectSources,147,.14,90,"sine",.035,700); }
function playAdvanceNotice(code) { const notes=code==="small"?[587,784]:code==="medium"?[523,698,988]:[440,659,880,1319];notes.forEach((frequency,index)=>tone(effectSources,frequency,.16,index*70,"sine",.075,3000)); }
function playWinBgm(code) { stopSources(bgmSources); const config=code==="small"?{duration:3.8,step:300,notes:[392,494,587,784]}:code==="medium"?{duration:10,step:340,notes:[294,392,440,587,494,659]}:{duration:18,step:375,notes:[220,330,392,523,440,659,587,784]}; const steps=Math.floor(config.duration*1000/config.step);for(let index=0;index<steps;index+=1){const frequency=config.notes[index%config.notes.length],delay=index*config.step;tone(bgmSources,frequency,.24,delay,index%4===0?"sine":"triangle",.07,1800);if(index%4===0)tone(bgmSources,frequency/2,.5,delay,"sine",.035,700);}bgmStatus.hidden=false;const timer=setTimeout(()=>{audioTimers.delete(timer);bgmStatus.hidden=true;},config.duration*1000);audioTimers.add(timer); }

soundButton.addEventListener("click", () => { soundEnabled=!soundEnabled;soundButton.textContent=soundEnabled?"SOUND ON":"SOUND OFF";soundButton.setAttribute("aria-pressed",String(soundEnabled));if(soundEnabled){ensureAudio();if(currentRound?.phase==="spinning")startSpinLoop();}else stopAllAudio(); });
volumeSlider.addEventListener("input", () => { const volume=Math.min(100,Math.max(0,Number(volumeSlider.value)));volumeValue.textContent=`${volume}%`;if(masterGain&&audioContext)masterGain.gain.setTargetAtTime(volume/100,audioContext.currentTime,.025); });

onAuthStateChanged(auth, async (user) => {
  currentUser = user; authAction.hidden = true;
  if (!user) {
    if (pendingPlay) stalePending = true;
    setMessage("NOX CHANCEの利用にはログインが必要です。", "error");
    authAction.href = "./login.html?next=nox-chance.html";
    authAction.textContent = "ログインする";
    authAction.hidden = false;
    updateControls();
    return;
  }
  if (!user.emailVerified) { setMessage("メール認証を完了してください。", "error");authAction.href="./mypage.html";authAction.textContent="マイページで確認する";authAction.hidden=false;updateControls();return; }
  await refreshStatus();
  if (pendingPlay) {
    stalePending = Date.now() - pendingPlay.startedAt > PENDING_MAX_AGE_MS;
    resultLabel.textContent = stalePending ? "以前のプレイ結果を自動確認できません。運営へお問い合わせください。" : "通信結果が未確認です。同じ操作を再確認できます。";
    gameStatus.textContent = "結果未確認"; updateControls();
  }
});

document.addEventListener("visibilitychange", () => { if (!document.hidden && currentUser && !currentRound && Date.now()-lastStatusAt>30000) refreshStatus(); });
window.addEventListener("pagehide", () => { for (const timer of timers) { clearTimeout(timer);clearInterval(timer); }timers.clear();stopAllAudio();if(audioContext)audioContext.close().catch(()=>undefined);audioContext=null;masterGain=null;currentRound=null;leverGesture=null; });
reels.forEach((_,index)=>renderWindow(index,index*2+1)); stops.forEach((button)=>{button.disabled=true;}); setPull(0); updateControls();
