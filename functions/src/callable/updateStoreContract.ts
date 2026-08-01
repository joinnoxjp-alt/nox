import { HttpsError, onCall } from "firebase-functions/v2/https";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { createAdminAuditLogDraft } from "../audit/adminAudit";

import { adminCallableOptions } from "../config";

import { firestore } from "../firebaseAdmin";

import { assertActiveAdmin } from "../security/adminAuthorization";

const PLAN_CODES = [
  "one_month",
  "six_months",
  "twelve_months",
  "custom",
] as const;

const PAYMENT_STATUSES = [
  "not_billed",
  "awaiting_payment",
  "paid",
  "expired",
  "suspended",
] as const;

const LISTING_STATUSES = [
  "pending",
  "active",
  "paused",
  "expired",
  "suspended",
] as const;

type PlanCode = (typeof PLAN_CODES)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
type ListingStatus = (typeof LISTING_STATUSES)[number];

interface ContractInput {
  storeUid: string;
  planCode: PlanCode;
  contractStartAt: string;
  contractEndAt: string;
  paymentStatus: PaymentStatus;
  listingStatus: ListingStatus;
  optionCodes: string[];
  adminNote: string;
  customPlan?: {
    label: string;
    durationMonths: number;
    listingAmount: number;
  };
}

interface PricingPlan {
  planCode: string;
  label: string;
  durationMonths: number;
  amount: number;
}

interface PricingOption {
  optionCode: string;
  label: string;
  billingUnit: string;
  amount: number;
}

function invalidArgument(): HttpsError {
  return new HttpsError("invalid-argument", "Contract input is invalid.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > maximum
  ) {
    throw invalidArgument();
  }
  return value.trim();
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) {
    throw invalidArgument();
  }
  return value as T[number];
}

function parseTimestamp(value: unknown): Timestamp {
  const text = requiredText(value, 40);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw invalidArgument();
  }
  return Timestamp.fromMillis(milliseconds);
}

function parseInput(value: unknown): ContractInput {
  if (!isRecord(value)) {
    throw invalidArgument();
  }

  const optionCodes = Array.isArray(value.optionCodes)
    ? value.optionCodes.map((item) => requiredText(item, 40))
    : [];

  if (
    optionCodes.length > 2 ||
    new Set(optionCodes).size !== optionCodes.length
  ) {
    throw invalidArgument();
  }

  const planCode = enumValue(value.planCode, PLAN_CODES);

  let customPlan: ContractInput["customPlan"];
  if (planCode === "custom") {
    if (!isRecord(value.customPlan)) {
      throw invalidArgument();
    }
    const durationMonths = value.customPlan.durationMonths;
    const listingAmount = value.customPlan.listingAmount;
    if (
      !Number.isInteger(durationMonths) ||
      Number(durationMonths) < 1 ||
      Number(durationMonths) > 120 ||
      !Number.isInteger(listingAmount) ||
      Number(listingAmount) < 0
    ) {
      throw invalidArgument();
    }
    customPlan = {
      label: requiredText(value.customPlan.label, 80),
      durationMonths: Number(durationMonths),
      listingAmount: Number(listingAmount),
    };
  }

  return {
    storeUid: requiredText(value.storeUid, 128),
    planCode,
    contractStartAt: requiredText(value.contractStartAt, 40),
    contractEndAt: requiredText(value.contractEndAt, 40),
    paymentStatus: enumValue(value.paymentStatus, PAYMENT_STATUSES),
    listingStatus: enumValue(value.listingStatus, LISTING_STATUSES),
    optionCodes,
    adminNote:
      typeof value.adminNote === "string"
        ? value.adminNote.trim().slice(0, 500)
        : "",
    ...(customPlan ? { customPlan } : {}),
  };
}

function pricingPlan(
  catalog: FirebaseFirestore.DocumentData,
  input: ContractInput,
): PricingPlan {
  if (input.planCode === "custom") {
    const custom = input.customPlan;
    if (!custom) {
      throw invalidArgument();
    }
    return {
      planCode: "custom",
      label: custom.label,
      durationMonths: custom.durationMonths,
      amount: custom.listingAmount,
    };
  }

  const fieldByCode = {
    one_month: "oneMonth",
    six_months: "sixMonths",
    twelve_months: "twelveMonths",
  } as const;
  const raw = catalog.listingPlans?.[fieldByCode[input.planCode]];

  if (
    !isRecord(raw) ||
    raw.planCode !== input.planCode ||
    typeof raw.label !== "string" ||
    !Number.isInteger(raw.durationMonths) ||
    !Number.isInteger(raw.amount) ||
    Number(raw.amount) < 0
  ) {
    throw new HttpsError("failed-precondition", "Pricing catalog is invalid.");
  }

  return {
    planCode: input.planCode,
    label: raw.label,
    durationMonths: Number(raw.durationMonths),
    amount: Number(raw.amount),
  };
}

function pricingOptions(
  catalog: FirebaseFirestore.DocumentData,
  optionCodes: string[],
): PricingOption[] {
  const fieldByCode: Record<string, string> = {
    top_ad: "topAd",
    new_job: "newJob",
  };

  return optionCodes.map((optionCode) => {
    const field = fieldByCode[optionCode];
    const raw = field ? catalog.options?.[field] : null;
    if (
      !isRecord(raw) ||
      raw.optionCode !== optionCode ||
      typeof raw.label !== "string" ||
      raw.billingUnit !== "month" ||
      !Number.isInteger(raw.amount) ||
      Number(raw.amount) < 0
    ) {
      throw invalidArgument();
    }
    return {
      optionCode,
      label: raw.label,
      billingUnit: "month",
      amount: Number(raw.amount),
    };
  });
}

function safeContractSummary(
  data: FirebaseFirestore.DocumentData | undefined,
): Record<string, unknown> {
  if (!data) {
    return {};
  }
  return {
    planCode: data.planCode ?? null,
    paymentStatus: data.paymentStatus ?? null,
    listingStatus: data.listingStatus ?? null,
    contractStartAt: data.contractStartAt ?? null,
    contractEndAt: data.contractEndAt ?? null,
    totalAmount: data.totalAmount ?? null,
  };
}

export const updateStoreContract = onCall(
  adminCallableOptions,
  async (request) => {
    const admin = await assertActiveAdmin(request.auth);
    const input = parseInput(request.data);
    const startAt = parseTimestamp(input.contractStartAt);
    const endAt = parseTimestamp(input.contractEndAt);

    if (endAt.toMillis() < startAt.toMillis()) {
      throw invalidArgument();
    }

    const storeReference = firestore.doc(`stores/${input.storeUid}`);
    const contractReference = firestore.doc(`storeContracts/${input.storeUid}`);
    const pricingReference = firestore.doc("pricingCatalog/current");
    const auditReference = firestore.collection("adminAuditLogs").doc();

    return firestore.runTransaction(async (transaction) => {
      const [storeSnapshot, contractSnapshot, catalogSnapshot] =
        await Promise.all([
          transaction.get(storeReference),
          transaction.get(contractReference),
          transaction.get(pricingReference),
        ]);

      if (!storeSnapshot.exists) {
        throw new HttpsError("not-found", "Store was not found.");
      }

      const storeOwnerId = storeSnapshot.data()?.ownerId;

      if (typeof storeOwnerId !== "string" || !storeOwnerId) {
        throw new HttpsError(
          "failed-precondition",
          "Store ownerId is not configured.",
        );
      }
      const jobsQuery = firestore
        .collection("jobs")
        .where("ownerId", "==", storeOwnerId);

      const jobsSnapshot = await transaction.get(jobsQuery);

      if (
        !catalogSnapshot.exists ||
        catalogSnapshot.data()?.status !== "active"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Pricing catalog is unavailable.",
        );
      }

      const catalog = catalogSnapshot.data() ?? {};
      const plan = pricingPlan(catalog, input);
      const options = pricingOptions(catalog, input.optionCodes);
      const optionSnapshots = Object.fromEntries(
        options.map((option) => [
          option.optionCode,
          {
            ...option,
            enabled: true,
          },
        ]),
      );
      const optionAmount = options.reduce(
        (sum, option) => sum + option.amount,
        0,
      );
      const totalAmount = plan.amount + optionAmount;
      const now = Timestamp.now();
      const isPublic =
        input.paymentStatus === "paid" &&
        input.listingStatus === "active" &&
        startAt.toMillis() <= now.toMillis() &&
        endAt.toMillis() >= now.toMillis();
      const previous = contractSnapshot.data();
      const contractData = {
        schemaVersion: 1,
        storeId: input.storeUid,
        ownerId: storeOwnerId,
        planCode: plan.planCode,
        planLabel: plan.label,
        durationMonths: plan.durationMonths,
        contractStartAt: startAt,
        contractEndAt: endAt,
        listingAmount: plan.amount,
        options: optionSnapshots,
        optionAmount,
        totalAmount,
        currency: "JPY",
        taxIncluded: true,
        billingMethod: "prepaid",
        paymentStatus: input.paymentStatus,
        listingStatus: input.listingStatus,
        pricingCatalogVersion: catalog.schemaVersion,
        pricingEffectiveFrom: catalog.effectiveFrom,
        adminNote: input.adminNote,
        createdAt: previous?.createdAt ?? FieldValue.serverTimestamp(),
        createdBy: previous?.createdBy ?? admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
        statusChangedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(contractReference, contractData);
      transaction.update(storeReference, {
        isPublic,
        contractListingStatus: input.listingStatus,
        contractEndAt: endAt,
      });

      jobsSnapshot.docs.forEach((jobSnapshot) => {
        transaction.update(jobSnapshot.ref, {
          status:
            input.listingStatus === "active"
              ? "approved"
              : jobSnapshot.data().status,
          isPublic,
          contractListingStatus: input.listingStatus,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: admin.uid,
        });
      });

      transaction.create(
        auditReference,
        createAdminAuditLogDraft(admin, {
          action: contractSnapshot.exists
            ? "store_contract_updated"
            : "store_contract_created",
          targetType: "storeContract",
          targetId: input.storeUid,
          before: safeContractSummary(previous),
          after: safeContractSummary(contractData),
        }),
      );

      return {
        success: true,
        storeUid: input.storeUid,
        isPublic,
        synchronizedJobCount: jobsSnapshot.size,
      };
    });
  },
);
