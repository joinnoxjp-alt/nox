import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAdminStoreIdAvailable,
  resolveAdminStoreCreateIdentity,
} from "../src/domain/adminStoreCreate";

test("uses the specified owner ID as the store ID", () => {
  const identity = resolveAdminStoreCreateIdentity(
    "existing-owner-uid",
    () => "unused-generated-id",
  );

  assert.equal(identity.storeId, "existing-owner-uid");
  assert.equal(identity.storePath, "stores/existing-owner-uid");
  assert.equal(identity.contractPath, "storeContracts/existing-owner-uid");
});

test("generates a store ID when owner ID is omitted", () => {
  const identity = resolveAdminStoreCreateIdentity(
    "",
    () => "generated-store-id",
  );

  assert.equal(identity.storeId, "generated-store-id");
});

test("rejects a duplicate store ID", () => {
  assert.throws(
    () => assertAdminStoreIdAvailable(true),
    /store-already-exists/,
  );
  assert.doesNotThrow(() => assertAdminStoreIdAvailable(false));
});

test("uses one ID for the store and contract created together", () => {
  const identity = resolveAdminStoreCreateIdentity(
    "",
    () => "shared-generated-id",
  );

  assert.equal(identity.storePath, "stores/shared-generated-id");
  assert.equal(identity.contractPath, "storeContracts/shared-generated-id");
});
