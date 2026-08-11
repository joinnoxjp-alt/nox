import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../../..");
const top = readFileSync(path.join(root, "index.html"), "utf8");
const styles = readFileSync(path.join(root, "style.css"), "utf8");
const diagnosisHtml = readFileSync(path.join(root, "ai-diagnosis.html"), "utf8");
const diagnosisJs = readFileSync(path.join(root, "diagnosis.js"), "utf8");
const girls = readFileSync(path.join(root, "pages/girls.html"), "utf8");

test("top page promotes the existing 40-question diagnosis route", () => {
  assert.match(top, /class="ai-spotlight"/);
  assert.match(top, /href="ai-diagnosis\.html"/);
  assert.match(top, /無料でAI診断する/);
  assert.match(top, /全40問/);
  assert.doesNotMatch(top, /30秒|1分で診断/);
  assert.match(styles, /@media\(max-width:600px\)[\s\S]*\.ai-spotlight/);
});

test("question data remains at exactly 40 questions", () => {
  const questionBlock = diagnosisJs.slice(diagnosisJs.indexOf("const questions"), diagnosisJs.indexOf("const options"));
  assert.equal((questionBlock.match(/text:/g) || []).length, 40);
});

test("result screen exposes exactly the four requested actions", () => {
  const actions = diagnosisHtml.match(/<div class="result-actions">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.equal((actions.match(/<(?:button|a)\b/g) || []).length, 4);
  for (const label of ["シェアする", "あなたに合う求人を見る", "もう一度診断する", "NOXトップに戻る"]) assert.match(actions, new RegExp(label));
  assert.doesNotMatch(actions, /Xで画像をシェア|結果をコピー|画像を保存・共有/);
});

test("share flow supports files, text fallback, download, clipboard, and cancellation", () => {
  assert.match(diagnosisJs, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
  assert.match(diagnosisJs, /navigator\.share\(\{ files: \[file\], text, url: DIAGNOSIS_URL/);
  assert.match(diagnosisJs, /navigator\.share\(\{ text, url: DIAGNOSIS_URL/);
  assert.match(diagnosisJs, /downloadResultFile\(file\)/);
  assert.match(diagnosisJs, /navigator\.clipboard\?\.writeText/);
  assert.match(diagnosisJs, /error\?\.name === "AbortError"/);
  for (const token of ["NOX AI夜職適性診断", "#NOX", "#夜職適性診断", "#AI診断", "https://joinnox.jp/ai-diagnosis.html"]) assert.match(diagnosisJs, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("diagnosis OGP uses complete absolute production metadata", () => {
  for (const property of ["og:title", "og:description", "og:image", "og:url", "og:type", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) assert.match(diagnosisHtml, new RegExp(property));
  assert.match(diagnosisHtml, /https:\/\/joinnox\.jp\/images\/ai-match\.jpg/);
  assert.match(diagnosisHtml, /summary_large_image/);
});

test("recommended jobs use existing filters and fall back to the normal list", () => {
  assert.match(diagnosisJs, /searchParams\.set\("recommendedType", jobs\[0\]\)/);
  assert.match(girls, /function applyRecommendationFromUrl\(\)/);
  assert.match(girls, /if \(!value\) return/);
  assert.match(girls, /if \(relatedJobExists\) keywordInput\.value = value/);
});
