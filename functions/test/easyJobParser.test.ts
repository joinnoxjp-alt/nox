import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const parser = require(path.resolve(__dirname, "../../../pages/easy-job-parser.js"));

const samples = [
  ["Anew", "《西船橋Anew/アニュー》\n【業種】ガールズバー\n【エリア】西船橋\n【住所】千葉県船橋市\n【最寄り駅】西船橋\n【営業時間】20:00〜LAST\n【平均時給】1,500円\n【送迎】あり\n【身分証明書】顔写真付き身分証", "西船橋Anew（アニュー）"],
  ["37°", "《37°/サンジュウナナドシー》\n【業種】ガールズバー\n【エリア】西船橋\n【住所】千葉県船橋市西船4丁目28-12 2階\n【最寄り駅】西船橋\n【定休日】日曜日\n【同伴バック】1000\n【ノルマ】なし", "37°（サンジュウナナドシー）"],
  ["POSEIDON", "《POSEIDON》\n【業種】キャバクラ\n【エリア】中洲\n【平均時給】7,000円前後\n【ドリンクバック】500円\n【体入時身分証】パスポート", "POSEIDON"],
  ["ラウンジリオ中洲", "《ラウンジリオ中洲》\n【業種】ラウンジ\n【エリア】中洲\n【採用時給】6,000円\n【送迎エリア】福岡市内\n【勤務時の服装】ドレス", "ラウンジリオ中洲"],
] as const;

for (const [name, source, expectedStore] of samples) test(`parses ${name}`, () => {
  const result = parser.parse(source);
  assert.equal(result.storeName, expectedStore);
  assert.ok(result.businessType);
  assert.ok(result.area);
  assert.match(result.title, /キャスト募集/);
  assert.match(result.description, /NOX公式LINE/);
  assert.equal(result.targetGender, "female");
  assert.equal(result.businessScope, "night");
});

test("does not invent absent facts and safely treats markup as text", () => {
  const result = parser.parse("《<script>alert(1)</script>安全店》\n【業種】一般事務");
  assert.doesNotMatch(result.storeName, /<script>/);
  assert.equal(result.salary, "");
  assert.equal(result.pickup, undefined);
  assert.equal(result.beginner, false);
  assert.equal(result.targetGender, "");
  assert.equal(result.businessScope, "general");
});

test("sets beginner only when explicitly written", () => {
  assert.equal(parser.parse("【店舗PR】未経験歓迎").beginner, true);
  assert.equal(parser.parse("【店舗PR】経験者優遇").beginner, false);
});

test("handles empty and long text without saving or throwing", () => {
  assert.equal(parser.parse("").storeName, "");
  assert.doesNotThrow(() => parser.parse(`《長文店》\n【店舗PR】${"案内".repeat(30000)}`));
});

test("daily pay is set only when explicitly present and respects no", () => {
  assert.equal(parser.parse("【全額日払い】あり").dailyPayValue, "true");
  assert.equal(parser.parse("【日払い】なし").dailyPayValue, "false");
  assert.equal(parser.parse("【業種】ガールズバー").dailyPayValue, "");
});
