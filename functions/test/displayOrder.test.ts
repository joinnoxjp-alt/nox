import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

type Item = { id: string; order?: number; visible?: boolean; fallback: number };

function sorted(items: Item[]): string[] {
  return items.filter((item) => item.visible !== false).sort((a, b) => {
    const order = (value?: number) =>
      Number.isInteger(value) && (value ?? 0) >= 1 ? value as number : Infinity;
    return order(a.order) - order(b.order) || a.fallback - b.fallback;
  }).map((item) => item.id);
}

test("category items sort ascending and hidden items stay hidden", () => {
  assert.deepEqual(sorted([
    { id: "A", order: 1, fallback: 0 }, { id: "B", order: 3, fallback: 1 },
    { id: "C", order: 2, fallback: 2 },
  ]), ["A", "C", "B"]);
  assert.deepEqual(sorted([
    { id: "A", order: 1, fallback: 0 }, { id: "B", order: 2, visible: false, fallback: 1 },
    { id: "C", order: 3, fallback: 2 },
  ]), ["A", "C"]);
});

test("jobs, casts, unset values and duplicate ranks remain deterministic", () => {
  assert.deepEqual(sorted([
    { id: "Beige", order: 2, fallback: 0 }, { id: "Freesia", order: 1, fallback: 1 },
    { id: "Store C", order: 3, fallback: 2 },
  ]), ["Freesia", "Beige", "Store C"]);
  assert.deepEqual(sorted([
    { id: "Cast A", order: 3, fallback: 0 }, { id: "Cast B", order: 1, fallback: 1 },
    { id: "Cast C", order: 2, fallback: 2 },
  ]), ["Cast B", "Cast C", "Cast A"]);
  assert.deepEqual(sorted([
    { id: "A", order: 2, fallback: 1 }, { id: "B", fallback: 2 },
    { id: "C", order: 1, fallback: 0 },
  ]), ["C", "A", "B"]);
  assert.deepEqual(sorted([
    { id: "A", order: 1, fallback: 0 }, { id: "B", order: 1, fallback: 1 },
    { id: "C", order: 2, fallback: 2 },
  ]), ["A", "B", "C"]);
});

test("admin UI, persistence and validation are wired", () => {
  const rootCandidates = [
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ];
  const root = rootCandidates.find((candidate) =>
    existsSync(path.join(candidate, "pages/admin.html")),
  );
  assert.ok(root, "repository root containing pages/admin.html was not found");
  const admin = readFileSync(path.join(root, "pages/admin.html"), "utf8");
  const home = readFileSync(path.join(root, "script.js"), "utf8");
  const callable = readFileSync(path.join(root, "functions/src/callable/manageAdminJob.ts"), "utf8");
  const rules = readFileSync(path.join(root, "firestore.rules"), "utf8");
  assert.match(admin, /id="adDisplayOrder\$\{slotNumber\}"[\s\S]*?min="1"[\s\S]*?step="1"/);
  assert.match(home, /getPositiveDisplayOrder\(adA\.displayOrder\)/);
  assert.match(home, /getPositiveDisplayOrder\(jobA\.topOrder\)/);
  assert.match(home, /getPositiveDisplayOrder\(a\.topDisplayOrder\)/);
  assert.match(callable, /key === "topOrder"[\s\S]*?value < 1/);
  assert.match(rules, /displayOrder is int/);
  assert.match(rules, /topDisplayOrder is int/);
});
