import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

type Job = {
  id: string;
  listingSource?: "official" | "public_info";
  topFeatured?: boolean;
  topOrder?: number;
  createdAt?: { seconds: number };
};

const root = path.resolve(__dirname, "../../..");

function topOrder(value?: number): number {
  return Number.isInteger(value) && (value ?? 0) >= 1 ? value as number : Infinity;
}

function comparePickup(a: Job, b: Job): number {
  return topOrder(a.topOrder) - topOrder(b.topOrder) ||
    (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) ||
    a.id.localeCompare(b.id);
}

function compareJobList(a: Job, b: Job): number {
  const sourcePriority =
    (a.listingSource === "public_info" ? 1 : 0) -
    (b.listingSource === "public_info" ? 1 : 0);
  return sourcePriority ||
    (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
}

test("PICK UP keeps every featured job and orders by topOrder across sources", () => {
  const jobs: Job[] = Array.from({ length: 12 }, (_, index) => ({
    id: `job-${String(index + 1).padStart(2, "0")}`,
    listingSource: index % 2 === 0 ? "public_info" : "official",
    topFeatured: true,
    topOrder: index === 10 ? undefined : 11 - index,
    createdAt: { seconds: index },
  }));

  const displayed = jobs.filter((job) => job.topFeatured === true).sort(comparePickup);
  assert.equal(displayed.length, 12);
  assert.deepEqual(displayed.slice(0, 3).map((job) => job.topOrder), [1, 2, 3]);
  assert.equal(displayed.at(-1)?.topOrder, undefined);
  assert.equal(displayed[0].listingSource, "public_info");
});

test("PICK UP tie-breaking is deterministic", () => {
  const jobs: Job[] = [
    { id: "b", topOrder: 1, createdAt: { seconds: 10 } },
    { id: "a", topOrder: 1, createdAt: { seconds: 10 } },
  ];
  assert.deepEqual(jobs.sort(comparePickup).map((job) => job.id), ["a", "b"]);
});

test("job lists put official jobs first and preserve recency within each source", () => {
  const jobs: Job[] = [
    { id: "public-new", listingSource: "public_info", createdAt: { seconds: 40 } },
    { id: "official-old", listingSource: "official", createdAt: { seconds: 10 } },
    { id: "official-new", listingSource: "official", createdAt: { seconds: 20 } },
    { id: "public-old", listingSource: "public_info", createdAt: { seconds: 30 } },
  ];
  assert.deepEqual(jobs.sort(compareJobList).map((job) => job.id), [
    "official-new", "official-old", "public-new", "public-old",
  ]);
});

test("all job list pages apply source priority and TOP has no six-item slice", () => {
  const home = readFileSync(path.join(root, "script.js"), "utf8");
  assert.doesNotMatch(home, /allTopFeaturedJobs[\s\S]{0,160}\.slice\(0,\s*6\)/);
  assert.match(home, /timeB - timeA \|\| jobA\.id\.localeCompare\(jobB\.id\)/);

  for (const page of ["jobs.html", "girls.html", "men.html"]) {
    const source = readFileSync(path.join(root, "pages", page), "utf8");
    assert.match(source, /const sourcePriority =[\s\S]*?listingSource === "public_info"[\s\S]*?if\s*\(sourcePriority !== 0\)/);
  }
});
