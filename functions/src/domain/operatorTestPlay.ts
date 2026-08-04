import type { ActiveAdminIdentity } from "../security/adminAuthorization";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const OPERATOR_TEST_PROBABILITY_PROFILES = [
  "standard",
  "high_probability_preview",
] as const;

export type OperatorTestProbabilityProfile =
  typeof OPERATOR_TEST_PROBABILITY_PROFILES[number];

const AUTHORIZED_OPERATOR_TEST = Symbol("AUTHORIZED_OPERATOR_TEST");

export interface OperatorTestPlayContext {
  readonly [AUTHORIZED_OPERATOR_TEST]: true;
  admin: ActiveAdminIdentity;
  isOperatorTest: true;
  probabilityProfile: OperatorTestProbabilityProfile;
  unlimited: true;
  accounting: {
    consumeFreePlay: false;
    consumeCoins: false;
    persistMedalDelta: false;
  };
  statistics: {
    includeInRevenue: false;
    includeInConversion: false;
    includeInMemberResults: false;
    includeInFreePlayUsage: false;
  };
}

export type OperatorTestPolicy = Omit<
  OperatorTestPlayContext,
  "admin" | typeof AUTHORIZED_OPERATOR_TEST
>;

type CallableAuth = Parameters<typeof assertActiveAdmin>[0];

function parseOperatorTestInput(value: unknown): OperatorTestProbabilityProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid-operator-test-input");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "probabilityProfile")) {
    throw new Error("unknown-operator-test-input");
  }
  if (!OPERATOR_TEST_PROBABILITY_PROFILES.includes(
    input.probabilityProfile as OperatorTestProbabilityProfile,
  )) {
    throw new Error("invalid-operator-test-probability-profile");
  }
  return input.probabilityProfile as OperatorTestProbabilityProfile;
}

export function createOperatorTestPolicy(
  input: unknown,
): OperatorTestPolicy {
  const probabilityProfile = parseOperatorTestInput(input);
  return {
    isOperatorTest: true,
    probabilityProfile,
    unlimited: true,
    accounting: {
      consumeFreePlay: false,
      consumeCoins: false,
      persistMedalDelta: false,
    },
    statistics: {
      includeInRevenue: false,
      includeInConversion: false,
      includeInMemberResults: false,
      includeInFreePlayUsage: false,
    },
  };
}

export async function authorizeOperatorTestPlay(
  auth: CallableAuth,
  input: unknown,
): Promise<OperatorTestPlayContext> {
  const admin = await assertActiveAdmin(auth);
  return {
    [AUTHORIZED_OPERATOR_TEST]: true,
    admin,
    ...createOperatorTestPolicy(input),
  };
}

export function isAuthorizedOperatorTestPlayContext(
  value: unknown,
): value is OperatorTestPlayContext {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<OperatorTestPlayContext>)[AUTHORIZED_OPERATOR_TEST] === true,
  );
}

export function createOperatorTestAuditDetails(
  context: OperatorTestPlayContext,
  input: { requestId: string; outcomeCode: string },
): {
  action: "nox_chance_operator_test_play";
  targetType: "nox_chance_operator_test";
  targetId: string;
  after: Record<string, unknown>;
} {
  if (!isAuthorizedOperatorTestPlayContext(context)) {
    throw new Error("unauthorized-operator-test-context");
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.requestId) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(input.outcomeCode)) {
    throw new Error("invalid-operator-test-audit-details");
  }
  return {
    action: "nox_chance_operator_test_play",
    targetType: "nox_chance_operator_test",
    targetId: input.requestId,
    after: {
      isOperatorTest: true,
      probabilityProfile: context.probabilityProfile,
      outcomeCode: input.outcomeCode,
      consumeFreePlay: false,
      consumeCoins: false,
      persistMedalDelta: false,
    },
  };
}
