import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalJobCompatibilityChanges } from "../src/domain/jobFields";
import { adminJobSourceFields } from "../src/domain/adminJobSource";
import { parseAdminJobInput } from "../src/domain/adminJobInput";

interface JobFieldsApi { normalize(data: Record<string, unknown>): Record<string, unknown>; featureLabel(value: unknown, enabled?: string): string; applyTypeLabel(value: string): string; listingSourceLabel(value?: string): string; }
const fields = require(path.resolve(__dirname, "../../../pages/job-fields.js")) as JobFieldsApi;

test("canonical fields stay aligned without mixing area and business", () => {
  const result = canonicalJobCompatibilityChanges({ storeName: "Store", title: "Title", businessType: "Bar", area: "Tokyo", salary: "3000", description: "Description", workHours: "20-1", requirements: "18+", benefits: "Transport", applyUrl: "https://example.test" });
  assert.equal(result.jobTitle, "Title");
  assert.equal(result.jobType, "Bar");
  assert.equal(result.location, "Tokyo");
  assert.notEqual(result.location, result.jobType);
});

test("legacy jobs normalize and booleans are not rendered as raw values", () => {
  const normalized = fields.normalize({ jobTitle: "Legacy", jobType: "Club", location: "Osaka" });
  assert.equal(normalized.title, "Legacy");
  assert.equal(normalized.businessType, "Club");
  assert.equal(normalized.area, "Osaka");
  assert.notEqual(fields.featureLabel(true), "true");
  assert.notEqual(fields.featureLabel(false), "false");
});

test("closed day uses the canonical field and supports legacy fallbacks", () => {
  for (const closedDay of ["日曜日", "不定休", "年中無休", "月曜・祝日"]) {
    assert.equal(fields.normalize({ closedDay }).closedDay, closedDay);
    assert.equal(canonicalJobCompatibilityChanges({ closedDay }).closedDay, closedDay);
  }
  for (const legacyField of ["holiday", "holidays", "closedDays", "regularHoliday", "dayOff"]) {
    assert.equal(fields.normalize({ [legacyField]: "日曜日" }).closedDay, "日曜日");
    assert.equal(canonicalJobCompatibilityChanges({ [legacyField]: "日曜日" }).closedDay, "日曜日");
  }
  assert.equal(canonicalJobCompatibilityChanges({ closedDay: "", holiday: "日曜日" }).closedDay, "");
  assert.equal(fields.normalize({ closedDay: "", holiday: "日曜日" }).closedDay, "");
  assert.equal(fields.normalize({}).closedDay, "");
  assert.equal(canonicalJobCompatibilityChanges({}).closedDay, "");
});

test("admin editing covers public detail fields and saves through manageAdminJob", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const detail = readFileSync(path.resolve(__dirname, "../../../pages/job-detail.html"), "utf8");
  const directCreate = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(admin, /editClosedDay-/);
  assert.match(directCreate, /directJobClosedDay/);
  assert.match(detail, /job\.closedDay \?/);
  for (const id of ["editPosition-", "editAddress-", "editStation-", "editBack-", "editDailyPay-", "editTrial-", "editBeginner-", "editAge-", "editShift-", "editTargetGender-", "editBusinessScope-"]) assert.match(admin, new RegExp(id));
  assert.match(admin, /manageAdminJobCallable/);
  assert.match(admin, /await loadPublishedJobs\(\)/);
  assert.match(detail, /NoxJobFields\.normalize/);
  assert.match(detail, /NoxJobFields\.featureLabel/);
  for (const field of ["contactPhone", "contactEmail"]) {
    assert.match(admin, new RegExp(field));
    assert.match(directCreate, new RegExp(field));
  }
});

test("manage function allowlists expanded fields and builds compatibility fields", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  assert.match(source, /"closedDay"/);
  for (const field of ["position", "back", "dailyPay", "trial", "beginner", "age", "shift", "targetGender", "businessScope"]) assert.match(source, new RegExp(`"${field}"`));
  assert.match(source, /canonicalJobCompatibilityChanges/);
  assert.match(source, /"applyType"/);
  assert.match(source, /Application URL must use HTTP or HTTPS/);
});

test("job editing never sends or permits immutable source linkage fields", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  assert.doesNotMatch(admin, /const listingSource = document\.getElementById\(`editListingSource-/);
  assert.doesNotMatch(admin, /businessScope,\s*listingSource,/);
  assert.match(admin, /掲載元（作成後は変更できません）/);
  assert.match(source, /IMMUTABLE_SOURCE_FIELDS/);
  for (const field of ["listingSource", "source", "ownerId", "storeId", "storeDocumentId"]) {
    assert.match(source, new RegExp(`"${field}"`));
  }
  assert.doesNotMatch(source, /changes\.listingSource/);
});

test("all job edit form payload fields are accepted by manageAdminJob", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  const fields = [
    "storeName", "shopName", "name", "businessType", "jobType", "category", "position",
    "area", "location", "salary", "salaryText", "address", "workLocation", "station", "nearestStation",
    "title", "jobTitle", "description", "jobDescription", "storeDescription", "selfPr",
    "workHours", "workingHours", "closedDay", "requirements", "qualification", "benefits", "treatment",
    "back", "dailyPay", "trial", "beginner", "age", "shift", "targetGender", "businessScope",
    "sourceUrl", "sourceCheckedAt", "adminSourceMemo", "applyType", "applyUrl", "topOrder", "status",
    "mainImage", "imageUrl", "image", "images",
  ];
  for (const field of fields) {
    assert.match(admin, new RegExp(`(?:\\b${field}\\b|${field}:)`), `${field} must be sent by the form`);
    assert.match(source, new RegExp(`"${field}"`), `${field} must be editable`);
  }
});

test("job edit displays safe callable errors and retains image upload fields", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  assert.match(admin, /safeCallableMessage/);
  assert.match(admin, /uploadBytes\([\s\S]*mainImage\s*=\s*await getDownloadURL/);
  for (const field of ["mainImage", "imageUrl", "image", "images"]) assert.match(admin, new RegExp(`${field}(?::|,)`));
});

test("application destination normalizes canonical and legacy URL fields", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(fields.normalize({ applyType: "instagram", applyUrl: "https://instagram.com/store" })).filter(([key]) => ["applyType", "applyUrl"].includes(key))),
    { applyType: "instagram", applyUrl: "https://instagram.com/store" },
  );
  const legacyLine = fields.normalize({ lineUrl: "https://lin.ee/store" });
  assert.equal(legacyLine.applyType, "line");
  assert.equal(legacyLine.applyUrl, "https://lin.ee/store");
  const legacyInstagram = fields.normalize({ instagramUrl: "https://instagram.com/legacy" });
  assert.equal(legacyInstagram.applyType, "instagram");
  assert.equal(legacyInstagram.applyUrl, "https://instagram.com/legacy");
});

test("direct admin creation validates and sends the canonical closed day", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  assert.match(admin, /id="directJobClosedDay"/);
  assert.match(admin, /const closedDay = document\.getElementById\("directJobClosedDay"\)/);
  assert.match(admin, /createAdminJobCallable\(\{[\s\S]*closedDay,/);
  assert.match(source, /parseAdminJobInput\(request\.data\)/);
  assert.match(source, /closedDay: input\.closedDay/);
});

test("direct admin creation covers complete job details and separated image roles", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const createSource = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  for (const id of ["directJobTrial", "directJobBeginner", "directJobAge", "directJobShift", "directJobPosition", "directJobTopOrder", "directJobMainImage", "directJobDetailImages"]) {
    assert.match(admin, new RegExp(`id="${id}"`));
  }
  for (const field of ["trial", "beginner", "age", "shift", "position", "topOrder", "mainImage", "mainImageStoragePath", "imageUrls", "imageStoragePaths"]) {
    assert.match(createSource, new RegExp(`input\\.${field}`));
  }
  assert.match(admin, /job-images\/\$\{uploadGroup\}\/main-/);
  assert.match(admin, /job-images\/\$\{uploadGroup\}\/detail-/);
});

test("published job administration provides a non-destructive duplicate flow", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const directCreate = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(admin, /duplicate-job-button/);
  assert.match(admin, /nox_admin_job_duplicate/);
  assert.match(admin, /delete duplicateSeed\[field\]/);
  for (const id of ["directJobStoreName", "directJobOwnerId", "directJobArea", "directJobAddress", "directJobStation", "directJobApplyType", "directJobApplyUrl", "directJobSourceMemo"]) {
    assert.match(directCreate, new RegExp(`${id}:`), `${id} must be populated into an editable creation field`);
  }
  assert.match(directCreate, /await createAdminJobCallable\(/);
  assert.doesNotMatch(directCreate, /manageAdminJobCallable[\s\S]*duplicateJobSeed/);
});

test("main and PR images remain separate during creation and main-image editing", () => {
  const direct = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const edit = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const create = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  assert.match(create, /mainImage: input\.mainImage,[\s\S]*imageUrl: input\.mainImage,[\s\S]*image: input\.mainImage/);
  assert.match(create, /imageUrls: input\.imageUrls,[\s\S]*images: input\.imageUrls/);
  assert.match(create, /mainImageStoragePath: input\.mainImageStoragePath,[\s\S]*imageStoragePaths: input\.imageStoragePaths/);
  assert.match(direct, /const newJobId = doc\(collection\(db, "jobs"\)\)\.id/);
  assert.match(direct, /jobId: newJobId/);
  assert.match(edit, /const updatedImages = Array\.isArray\(oldData\.imageUrls\)/);
  assert.match(edit, /imageUrls:updatedImages/);
  assert.doesNotMatch(edit, /const updatedImages =\s*mainImage\s*\? \[mainImage\]/);
});

test("duplicate warning offers an administrator-only confirmed override", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const create = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  const input = readFileSync(path.resolve(__dirname, "../../src/domain/adminJobInput.ts"), "utf8");
  assert.match(admin, /link\.textContent = "既存求人を編集"/);
  assert.match(admin, /approveButton\.textContent = "掲載を承認する"/);
  assert.match(admin, /重複候補がありますが、この内容を別求人として新規登録・公開します/);
  assert.match(admin, /approveButton\.disabled = true/);
  assert.match(admin, /approveDuplicate,/);
  assert.match(input, /approveDuplicate: input\.approveDuplicate === true/);
  assert.match(create, /assertActiveAdmin\(request\.auth\)/);
  assert.match(create, /duplicate && duplicateRequiresBlock\(duplicate, input\.approveDuplicate\)/);
  assert.match(create, /input\.approveDuplicate \? \[\] : lockIds/);
  assert.match(create, /transaction\.create\(jobReference/);
  assert.match(create, /create_admin_job_duplicate_override/);
});

test("listing source defaults legacy jobs to official and labels both sources", () => {
  assert.equal(fields.normalize({}).listingSource, "official");
  assert.equal(fields.normalize({ listingSource: "public_info" }).listingSource, "public_info");
  assert.equal(fields.listingSourceLabel(), "NOX掲載店舗");
  assert.equal(fields.listingSourceLabel("public_info"), "公開情報確認済");
});

test("public-info creation is never linked to an owner or store", () => {
  assert.deepEqual(adminJobSourceFields("public_info", "stale-owner", "stale-store"), {
    listingSource: "public_info",
    source: "admin_public_info",
    ownerId: "",
    storeId: "",
    storeDocumentId: "",
  });
});

test("official creation preserves the resolved owner and store", () => {
  assert.deepEqual(adminJobSourceFields("official", "owner-1", "store-1"), {
    listingSource: "official",
    source: "admin_direct",
    ownerId: "owner-1",
    storeId: "store-1",
    storeDocumentId: "store-1",
  });
});

test("direct admin creation sends public_info and clears its owner ID", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(admin, /<option value="public_info">公開情報確認済<\/option>/);
  assert.match(admin, /listingSource === "official" \? enteredOwnerId : ""/);
  assert.match(admin, /listingSource, sourceUrl, sourceCheckedAt, adminSourceMemo/);
});

test("the reported public-info payload is accepted without owner or source URL", () => {
  const input = parseAdminJobInput({
    listingSource: "public_info", storeName: "レオ", ownerId: "",
    title: "【中洲】キャバクラ「レオ」キャスト募集｜平均時給6,000円・ノルマなし",
    businessType: "キャバクラ", area: "中洲", salary: "平均時給6,000円",
    description: "", closedDay: "日曜日", applyType: "line",
    applyUrl: "https://lin.ee/S7nF03G", sourceUrl: "",
    sourceCheckedAt: "2026/08/12",
    adminSourceMemo: "BIG関連求人。\n公開情報確認済として掲載。",
  });
  assert.equal(input.ownerId, "");
  assert.equal(input.sourceUrl, "");
  assert.equal(input.sourceCheckedAt, "2026-08-12");
  assert.equal(input.applyType, "line");
  assert.equal(input.applyUrl, "https://lin.ee/S7nF03G");
  assert.deepEqual(adminJobSourceFields(input.listingSource, input.ownerId, "unexpected-store"), {
    listingSource: "public_info", source: "admin_public_info", ownerId: "", storeId: "", storeDocumentId: "",
  });
});

test("official input still requires an owner ID", () => {
  assert.throws(() => parseAdminJobInput({
    listingSource: "official", storeName: "Official", ownerId: "", title: "Title",
    businessType: "Bar", applyType: "line", applyUrl: "https://lin.ee/test",
  }), /ownerIdを入力してください/);
});

test("private source metadata is not rendered by public job pages", () => {
  for (const file of ["index.html", "script.js", "pages/jobs.html", "pages/girls.html", "pages/men.html", "pages/job-detail.html"]) {
    const source = readFileSync(path.resolve(__dirname, `../../../${file}`), "utf8");
    assert.doesNotMatch(source, /adminSourceMemo/);
    assert.doesNotMatch(source, /BIG関連|BIGから情報提供|BIGとの関係/);
  }
});

test("admin source metadata is handled only by trusted job functions", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const directCreate = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const createSource = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  const manageSource = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  for (const field of ["listingSource", "sourceUrl", "sourceCheckedAt", "adminSourceMemo"]) {
    assert.match(createSource, new RegExp(field));
  }
  for (const field of ["sourceUrl", "sourceCheckedAt", "adminSourceMemo"]) assert.match(manageSource, new RegExp(field));
  assert.match(directCreate, /id="directJobListingSource"/);
  assert.doesNotMatch(admin, /id="editListingSource-/);
  assert.match(admin, /情報確認日を今日に更新/);
});

test("Functions deployment always builds TypeScript before upload", () => {
  const firebaseConfig = JSON.parse(readFileSync(path.resolve(__dirname, "../../../firebase.json"), "utf8"));
  assert.deepEqual(firebaseConfig.functions.predeploy, ['npm --prefix "$RESOURCE_DIR" run build']);
});
