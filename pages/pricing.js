import { db } from "./firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PRICING_DOCUMENT_PATH = "pricingCatalog/current";
const CONTACT_MESSAGE =
  "料金情報を確認できません。NOX運営へお問い合わせください。";
const REQUIRED_FLOW = [
  "料金確認",
  "店舗掲載申請",
  "NOX公式LINE追加",
  "NOX運営から案内",
  "前払い",
  "入金確認",
  "掲載開始"
];
const PLAN_DEFINITIONS = [
  ["oneMonth", "one_month", 1],
  ["sixMonths", "six_months", 6],
  ["twelveMonths", "twelve_months", 12]
];
const OPTION_DEFINITIONS = [
  ["topAd", "top_ad"],
  ["newJob", "new_job"]
];

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isTimestamp(value) {
  return value
    && typeof value.toDate === "function"
    && value.toDate() instanceof Date
    && !Number.isNaN(value.toDate().getTime());
}

function requiredText(value, maximum = 100) {
  return typeof value === "string"
    && value.trim().length > 0
    && value.trim().length <= maximum;
}

function validatePlan(plan, planCode, durationMonths) {
  return isPlainObject(plan)
    && plan.planCode === planCode
    && requiredText(plan.label)
    && plan.durationMonths === durationMonths
    && isNonNegativeInteger(plan.amount);
}

function validateOption(option, optionCode) {
  return isPlainObject(option)
    && option.optionCode === optionCode
    && requiredText(option.label)
    && option.billingUnit === "month"
    && isNonNegativeInteger(option.amount);
}

export function validatePricingCatalog(data) {
  if (
    !isPlainObject(data)
    || data.schemaVersion !== 1
    || data.currency !== "JPY"
    || data.taxIncluded !== true
    || data.billingMethod !== "prepaid"
    || data.status !== "active"
    || !isTimestamp(data.effectiveFrom)
    || !isTimestamp(data.updatedAt)
    || !requiredText(data.updatedBy, 128)
    || !isPlainObject(data.listingPlans)
    || !isPlainObject(data.options)
    || !Array.isArray(data.applicationFlow)
    || data.applicationFlow.length !== REQUIRED_FLOW.length
  ) {
    return false;
  }

  const plansAreValid = PLAN_DEFINITIONS.every(
    ([field, code, duration]) =>
      validatePlan(data.listingPlans[field], code, duration)
  );
  const optionsAreValid = OPTION_DEFINITIONS.every(
    ([field, code]) =>
      validateOption(data.options[field], code)
  );
  const flowIsValid = REQUIRED_FLOW.every(
    (label, index) => data.applicationFlow[index] === label
  );

  return plansAreValid && optionsAreValid && flowIsValid;
}

export async function loadPricingCatalog() {
  const snapshot = await getDoc(doc(db, ...PRICING_DOCUMENT_PATH.split("/")));
  if (!snapshot.exists() || !validatePricingCatalog(snapshot.data())) {
    throw new Error("pricing-unavailable");
  }
  return snapshot.data();
}

export function formatJapaneseYen(amount) {
  if (!isNonNegativeInteger(amount)) {
    throw new Error("invalid-price");
  }
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(amount);
}

export function createPricingDisplayModel(catalog) {
  if (!validatePricingCatalog(catalog)) {
    throw new Error("pricing-unavailable");
  }

  return {
    plans: PLAN_DEFINITIONS.map(([field]) => {
      const plan = catalog.listingPlans[field];
      return {
        code: plan.planCode,
        label: plan.label,
        durationMonths: plan.durationMonths,
        formattedAmount: formatJapaneseYen(plan.amount)
      };
    }),
    options: OPTION_DEFINITIONS.map(([field]) => {
      const option = catalog.options[field];
      return {
        code: option.optionCode,
        label: option.label,
        billingUnit: "月",
        formattedAmount: formatJapaneseYen(option.amount)
      };
    }),
    applicationFlow: [...catalog.applicationFlow],
    paymentNote: "すべて税込・前払い"
  };
}

function clearElement(element) {
  element.replaceChildren();
}

export function renderPricingPlans(element, model) {
  clearElement(element);
  model.plans.forEach((plan) => {
    const card = document.createElement("article");
    card.className = "card pricing-plan-card";

    const title = document.createElement("h3");
    title.textContent = plan.label;
    const price = document.createElement("p");
    price.className = "price";
    price.textContent = plan.formattedAmount;

    card.append(title, price);
    element.append(card);
  });
}

export function renderPricingOptions(element, model) {
  clearElement(element);
  model.options.forEach((option) => {
    const item = document.createElement("div");
    item.className = "pricing-option";
    const label = document.createElement("strong");
    label.textContent = option.label;
    const price = document.createElement("span");
    price.textContent =
      `${option.formattedAmount}／${option.billingUnit}`;
    item.append(label, price);
    element.append(item);
  });
}

export function renderApplicationFlow(element, model) {
  clearElement(element);
  model.applicationFlow.forEach((label, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${label}`;
    element.append(item);
  });
}

export function renderPricingError(element) {
  clearElement(element);
  const message = document.createElement(
    element.tagName === "OL" || element.tagName === "UL"
      ? "li"
      : "p"
  );
  message.className = "pricing-error";
  message.textContent = CONTACT_MESSAGE;
  element.append(message);
}

export { CONTACT_MESSAGE };
