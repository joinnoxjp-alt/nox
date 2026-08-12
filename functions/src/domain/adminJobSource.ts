export type AdminJobListingSource = "official" | "public_info";

export interface AdminJobSourceFields {
  listingSource: AdminJobListingSource;
  source: "admin_direct" | "admin_public_info";
  ownerId: string;
  storeId: string;
  storeDocumentId: string;
}

export function adminJobSourceFields(
  listingSource: AdminJobListingSource,
  ownerId: string,
  storeId: string,
): AdminJobSourceFields {
  if (listingSource === "public_info") {
    return { listingSource: "public_info", source: "admin_public_info", ownerId: "", storeId: "", storeDocumentId: "" };
  }
  return { listingSource: "official", source: "admin_direct", ownerId, storeId, storeDocumentId: storeId };
}
