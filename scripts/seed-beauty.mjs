import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const args = new Set(process.argv.slice(2));
const projectArg = process.argv.find((value) => value.startsWith("--project="));
const projectId = projectArg?.slice("--project=".length) || "";
const commit = args.has("--commit");
const updateExisting = args.has("--update-existing");
const allowProduction = args.has("--allow-production");
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const isDemo = projectId.startsWith("demo-") && emulatorHost.length > 0;

if (!projectId) {
  throw new Error("--project=<project-id> is required");
}
if (commit && !isDemo && !allowProduction) {
  throw new Error(
    "Production writes are locked. Use an emulator, or explicitly pass "
    + "--allow-production after reviewing the dry-run."
  );
}
if (commit && !isDemo && projectId !== "noxapp-29171") {
  throw new Error("Unexpected production project ID");
}

const brand = {
  brandName: "MIRÈIO",
  brandNameJa: "ミルアジュ",
  partnerLabel: "NOX公式パートナーブランド",
  catchCopy: "魅せる肌を目指す方 必見。",
  subCopy: "韓国発プレミアムスキンケアブランド",
  description: "NOXでは、美容意識の高いユーザーの皆様へ新しい選択肢を届けるため、韓国発スキンケアブランドMIRÈIOと公式パートナー提携しました。",
  story: "MIRÈIOは韓国発のプレミアムスキンケアブランド。毎日続けやすい3STEPで、肌にうるおいを与え、すこやかに整えるケアを提案します。",
  trustText: "販売事業者から提供された商品情報・資料を確認のうえ掲載しています。",
  heroMedia: null,
  reasonMedia: null,
  storyMedia: null,
  stepMedia: null,
  trustMedia: null,
  purchaseMedia: null,
  extraMedia: [],
  faqs: [
    { q: "単品購入できますか？", a: "はい。各商品それぞれ単品で購入できます。" },
    { q: "3点セットはありますか？", a: "はい。MIST・AMPOULE・CREAMの3点セットをご用意しています。" },
    { q: "送料は？", a: "商品代とは別途必要です。地域により送料が異なります。" },
    { q: "発送元は？", a: "MIRÈIO販売事業者より直接発送します。" },
    { q: "支払い方法は？", a: "現時点では銀行振込を予定しています。" }
  ],
  isPublic: false
};

const products = [
  { id: "mist", shortName: "MIST", name: "Mirèio ミルアジュ ラクトバチルス保湿ミスト", volume: "100mL", price: 3600, janCode: "8800298230002", description: "きめ細かなミストで、肌にうるおいを与えて整えます。", displayOrder: 1 },
  { id: "ampoule", shortName: "AMPOULE", name: "MIRÈIO リバイタライズ アンプル", volume: "30mL", price: 8000, janCode: "8800298230019", description: "いつものお手入れに取り入れやすい、なめらかな使用感の美容液です。", displayOrder: 2 },
  { id: "cream", shortName: "CREAM", name: "MIRÈIO モイスチャライジング ラディアント クリーム", volume: "50g", price: 6400, janCode: "8800298230026", description: "肌にうるおいを与え、毎日の保湿ケアを心地よく仕上げます。", displayOrder: 3 },
  { id: "three-step-set", shortName: "3STEP SET", name: "MIRÈIO 3点セット", volume: "MIST + AMPOULE + CREAM", price: 18000, janCode: "", description: "3STEPで始めるプレミアムケア。", displayOrder: 4, isSetProduct: true, setProductIds: ["mist", "ampoule", "cream"] }
];

const preview = {
  projectId,
  emulatorHost: emulatorHost || null,
  mode: commit ? "commit" : "dry-run",
  updateExisting,
  brand: { id: "mireio", ...brand },
  products,
  commerce: { salesEnabled: false }
};
console.log(JSON.stringify(preview, null, 2));

if (!commit) {
  console.log("Dry-run only. No Firebase data was changed.");
  process.exit(0);
}

const app = initializeApp({
  projectId,
  ...(isDemo ? {} : { credential: applicationDefault() })
});
const firestore = getFirestore(app);
const references = [
  firestore.doc("beautyBrands/mireio"),
  ...products.map((product) => firestore.doc(`beautyProducts/${product.id}`))
];
const existing = await firestore.getAll(...references);
const collisions = existing.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.ref.path);
if (collisions.length && !updateExisting) {
  throw new Error(`Existing documents found; nothing written: ${collisions.join(", ")}`);
}

const batch = firestore.batch();
batch.set(references[0], {
  ...brand,
  createdAt: existing[0].data()?.createdAt || FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
}, { merge: updateExisting });
products.forEach((product, index) => batch.set(references[index + 1], {
  ...product,
  brandId: "mireio",
  isPublic: false,
  mainImage: null,
  detailImages: [],
  videos: [],
  ingredientImage: null,
  createdAt: existing[index + 1].data()?.createdAt || FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
}, { merge: updateExisting }));
await batch.commit();
await firestore.doc("beautySettings/commerce").set({
  salesEnabled: false,
  updatedAt: FieldValue.serverTimestamp()
}, { merge: true });
const written = await firestore.getAll(...references);
if (written.some((snapshot) => !snapshot.exists || snapshot.data()?.isPublic !== false)) {
  throw new Error("Seed verification failed; expected five private documents");
}
const commerceSnapshot = await firestore.doc("beautySettings/commerce").get();
if (!commerceSnapshot.exists || commerceSnapshot.data()?.salesEnabled !== false) {
  throw new Error("Seed verification failed; salesEnabled must remain false");
}
console.log("Seed completed and verified: five documents all private; salesEnabled is false.");
