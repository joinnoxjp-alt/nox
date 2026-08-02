export interface AdminStoreCreateIdentity {
  storeId: string;
  storePath: string;
  contractPath: string;
}

export function resolveAdminStoreCreateIdentity(
  requestedStoreId: string,
  generateStoreId: () => string,
): AdminStoreCreateIdentity {
  const storeId = requestedStoreId || generateStoreId();

  if (!storeId) {
    throw new Error("A store ID could not be generated.");
  }

  return {
    storeId,
    storePath: `stores/${storeId}`,
    contractPath: `storeContracts/${storeId}`,
  };
}

export function assertAdminStoreIdAvailable(exists: boolean): void {
  if (exists) {
    throw new Error("store-already-exists");
  }
}
