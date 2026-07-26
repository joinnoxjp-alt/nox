# NOX Firebase schema inventory

Status: Phase 1 documentation only  
Production data changed: No  
Production rules changed: No

This document records fields found in the current client implementation. It
does not assert that every field exists in production. The Phase 1 audit must
measure the real documents before any migration is planned or executed.

## Conventions

| Mark | Meaning |
|---|---|
| Current | Read or written by the current repository |
| Planned | Canonical field intended for the secured schema |
| Legacy | Kept only for compatibility during migration |
| Required audit | Must be measured before Phase 2 |

Authorization must use Firebase Authentication UID plus canonical identifier
fields. Display values such as `storeName` must never grant access.

## Collection summary

| Collection | Purpose | Intended reader | Intended writer |
|---|---|---|---|
| `users` | User, store and administrator account profiles | Self; administrators | Self-safe fields; administrators for privilege fields |
| `stores` | Store profile and ownership record | Owning store; administrators | Owning store-safe fields; administrators |
| `jobs` | Published job listings | Public approved jobs; owner; administrators | Administrators |
| `jobApplications` | Store-to-NOX publication requests | Administrators | Active stores create; administrators review |
| `applications` | Job-seeker-to-store applications | Applicant; destination store; administrators | Applicant creates; destination store changes workflow status |
| `jobEntries` | Legacy job-seeker applications | Migrated owner/applicant; administrators | No new records |
| `storeInvites` | Privilege-bearing store invitations | Administrators/backend | Administrators/backend |
| `casts` | Public cast profiles | Public visible profiles; administrators | Administrators |
| `ads` | Public advertisements and commercial metadata | Public enabled ads; administrators | Administrators/backend counters |
| `jobViewStats` | Per-job/day view aggregates | Owning store; administrators | Trusted backend |
| `storeViewStats` | Per-store/day view aggregates | Owning store; administrators | Trusted backend |

## `users`

Purpose: Authentication-linked profile and authorization metadata.

| Category | Fields |
|---|---|
| Current identity/profile | `uid`, `name`, `nickname`, `email`, `phone`, `birthDate`, `bio`, `profileImage` |
| Current job preferences | `area`, `jobType`, `salary`, `experience`, `height`, `bodyType`, `alcohol`, `workDays`, `selfPr`, `sns` |
| Current member state | `savedJobIds`, `role`, `status`, `storeName`, `createdAt`, `updatedAt` |
| Planned canonical | Document ID = Auth UID; `role`; `status`; profile/preference fields; `savedJobIds`; timestamps |
| Legacy/duplicate | `name` versus `nickname`; `bio` versus `selfPr`; user-level `storeName`; optional duplicated `uid` |
| Migration needed | Validate document ID against Auth UID; audit every `role` and `status`; preserve valid `admin`/`store`; remove authorization dependence on `storeName`; move Base64 `profileImage` to Storage later |

Planned `role` values: `user`, `store`, `admin`.  
Observed/planned `status` values: `pending`, `active`, `blocked`.

## `stores`

Purpose: One authoritative profile per store owner account.

| Category | Fields |
|---|---|
| Current ownership | `ownerId`, document ID |
| Current profile | `ownerName`, `storeName`, `email`, `area`, `phone`, `line`, `instagram`, `description` |
| Current invitation/source | `inviteCode`, `sourceApplicationId` |
| Current timestamps | `createdAt`, `updatedAt` |
| Planned canonical | Document ID = owning Auth UID; `ownerId` = same UID; store profile fields; timestamps |
| Legacy/duplicate | Store identity inferred from `storeName`; store profile duplicated in `users` and `jobs` |

### Store media

Store media belongs to the Authentication UID that is also stored in
`stores/{uid}.ownerId`. The Storage path is the authoritative reference. URL
fields are display caches and may be regenerated with `getDownloadURL()` when
they expire or fail to load.

| Media | Firestore fields | Storage path | Limit |
|---|---|---|---:|
| Logo | `logoStoragePath`, `logoUrl` | `stores/{uid}/logo/{uuid}` | 2 MB |
| Cover | `coverImageStoragePath`, `coverImageUrl` | `stores/{uid}/cover/{uuid}` | 5 MB |
| Profile | `profileImageStoragePath`, `profileImageUrl` | `stores/{uid}/profile/{uuid}` | 2 MB |
| Gallery | `stores/{uid}/galleryImages/{slot}.storagePath`, `.url` | `stores/{uid}/gallery/{slot}/{uuid}` | 5 MB each, slots `0`–`9` |

`mediaUpdatedAt` records the last metadata update. Only JPEG, PNG, and WebP are
accepted. SVG, GIF, video, unknown content types, and paths outside the owning
`stores/{uid}/` prefix are rejected. A replacement is performed in this order:
upload the new image, update Firestore, then delete the old image. Deletion and
cleanup must use the stored owner-scoped `storagePath`, never a URL supplied by
the browser.

Gallery entries use ten fixed Firestore slot document IDs (`0` through `9`).
This makes the ten-image maximum enforceable by Rules without trusting a
browser-maintained counter or exceeding the Rules expression limit.
| Migration needed | Find missing/mismatched `ownerId`; verify document ID; resolve duplicate store names manually; stop using names for authorization |

## `jobs`

Purpose: Canonical store-owned job listing. Authorization and queries use only
`ownerId` and `storeId`; both equal the owning Authentication UID. `storeName`
is display cache and never an ownership key.

| Category | Required schema version 1 fields |
|---|---|
| Identity | `schemaVersion`, `ownerId`, `storeId`, display-only `storeName` |
| Listing | `title`, `category`, `targetGender`, `position`, `area`, `address`, `station`, `businessHours`, `salary`, `trial`, `beginner`, `description`, `requirements`, `benefits` |
| Images | `imageStoragePaths`, `imageUrls`; parallel lists, maximum 10 |
| Publication cache | `status`, `isPublic`, `contractListingStatus` |
| Ownership audit | `createdAt`, `createdBy`, `updatedAt`, `updatedBy` |
| Review/status audit | `approvedAt`, `approvedBy`, `pausedAt`, `pausedBy`, `reapprovalRequestedAt`, `archivedAt`, `archivedBy` |
| Source | nullable `sourceApplicationId` |

Canonical statuses are `draft`, `pending`, `approved`, `paused`,
`reapproval_pending`, `rejected`, and `archived`.

A store may transition `draft -> pending`, `approved -> paused`,
`paused -> reapproval_pending`, `rejected -> draft`, and
`draft|paused|rejected -> archived`. Draft, paused, and rejected content may be
edited while remaining non-public. An approved listing cannot be edited while
staying approved. Approval, rejection, publication-cache changes, and archived
restoration require trusted backend code. Physical deletes are denied.

Public reads require `status == "approved"`, `isPublic == true`, and
`contractListingStatus == "active"`. Contract timestamps will additionally be
checked by the future public UI and expiry Function.

Canonical images use `jobs/{storeUid}/{jobId}/{fileId}` and the job must have
both UID ownership fields equal to `{storeUid}`. The legacy two-level path
`jobs/{storeUid}/{fileName}` remains publicly readable but is read-only.

The create screen reserves a canonical `jobs/{jobId}` draft before uploading,
because Storage Rules verify the job's `ownerId` and `storeId`. Images are
validated as JPEG, PNG, or WebP, limited to 5 MiB each and ten images total.
`imageStoragePaths` is authoritative; `imageUrls` is a display cache. The final
draft-to-pending update and `jobApplications/{jobId}` creation are committed in
one batch. If that batch fails, newly uploaded objects are cleaned up where
possible and no publication application is created.

## `jobApplications`

Purpose: Store submission for NOX administrative review. This is not a
job-seeker application.

| Category | Fields |
|---|---|
| Current listing data | Most listing fields described under `jobs` |
| Current review data | `status`, `approvedAt`, `approvedBy` |
| Current invitation data | `inviteCode`, `inviteUrl`, `inviteCreatedAt` |
| Current source/timestamps | document ID, `createdAt` |
| Planned canonical | `ownerId`, `submittedBy`, listing payload, `status`, review metadata, timestamps |
| Legacy/missing | Records without `ownerId` or `submittedBy`; image aliases |
| Migration needed | Link each request to a verified store UID; identify requests that cannot be attributed; deduplicate approved jobs by `sourceApplicationId` |

## `applications`

Purpose: Canonical job-seeker application sent to one UID-owned store.

Schema version 1 requires `jobId`, `storeId`, `applicantId`, `name`, `phone`,
`message`, `status`, `createdAt`, `updatedAt`, `contactedAt`,
`interviewScheduledAt`, `hiredAt`, and `rejectedAt`. Creation requires an
active general user, binds `applicantId` to the caller UID, and verifies
`storeId` against both UID ownership fields of an approved, public,
contract-active job.

Canonical statuses are `new`, `contacted`, `interview_scheduled`, `hired`, and
`rejected`. Allowed transitions are `new -> contacted|rejected`,
`contacted -> interview_scheduled|rejected`, and
`interview_scheduled -> hired|rejected`. Terminal states cannot be restored.
The destination store may change only workflow status, `updatedAt`, and the
corresponding workflow timestamps. Applicant identity, content, job, store,
and creation fields are immutable.

Legacy `progress` and `ng`, name-based ownership fallback, and `jobEntries`
writes are not part of the canonical model.

The store dashboard queries this collection with `storeId == Auth UID` ordered
by `createdAt` descending. This query requires the composite index declared in
`firestore.indexes.json`.

## `jobEntries`

Purpose: Legacy job-seeker application format.

| Category | Fields |
|---|---|
| Current observed usage | `storeName`, applicant display fields, `status`, `createdAt`; arbitrary legacy fields must be audited |
| Planned canonical | No new records |
| Legacy | Entire collection |
| Migration needed | Count records and enumerate field names; map deterministic records to `applications`; archive ambiguous records for administrator-only access |

## `storeInvites`

Purpose: Single-use invitation that grants store registration eligibility.

| Category | Fields |
|---|---|
| Current target | `storeName`, `email`, `sourceApplicationId` |
| Current state | `used`, `registeredUid`, `registeredAt` |
| Current audit | `createdAt`, `createdBy` |
| Current delivery | document ID as invite code |
| Planned canonical | Same business fields plus expiry/revocation metadata, consumed by trusted backend only |
| Legacy/security concern | Browser reads and consumes privilege-bearing invite directly |
| Migration needed | Add `expiresAt` and `revokedAt`; move verification/consumption to backend transaction |

## `casts`

Purpose: Public cast profile and media metadata.

| Category | Fields |
|---|---|
| Current profile | `name`, `gender`, `age`, `storeName`, `jobType`, `area`, `catchCopy`, `description` |
| Current publication | `visible`, `startDate`, `endDate`, ordering/popularity fields, timestamps |
| Current media | `mainImageUrl`, `mainImageStoragePath`, `galleryImages`, `galleryStoragePaths`, `videoUrl`, `videoStoragePath` |
| Current content | schedule, interview, SNS, store and promotional fields |
| Planned canonical | Explicit `visible`; profile; image-only media paths under cast ID; timestamps |
| Legacy | Video fields under an image-only Storage policy; profiles missing explicit `visible` |
| Migration needed | Measure missing `visible`; decide video policy; normalize media paths; avoid public access to hidden profiles |

## `ads`

Purpose: Six managed advertisement slots and reporting metadata.

| Category | Fields |
|---|---|
| Current content | `slot`, `advertiserName`, `title`, `description`, `linkUrl`, `buttonText`, `imageUrl`, `storagePath` |
| Current state | `enabled`, `startDate`, `endDate`, `automaticallyDisabledAt` |
| Current commercial | `contractPrice`, `paymentStatus` |
| Current counters | `impressions`, `clicks` |
| Planned canonical | Managed content/state fields; server-maintained counters; audit timestamps |
| Legacy/security concern | Browser directly increments counters |
| Migration needed | Move counters to trusted backend; validate slot document IDs; preserve reporting history |

## `jobViewStats`

Purpose: Daily job view aggregate.

| Category | Fields |
|---|---|
| Current | `jobId`, `storeId`, `storeName`, `dateKey`, `count`, `updatedAt` |
| Planned canonical | `jobId`, verified `storeId`, `dateKey`, server-maintained `count`, timestamps |
| Legacy | `storeName` used by dashboard query; records missing `storeId` |
| Migration needed | Populate `storeId` from verified job ownership; move writes to trusted backend |

## `storeViewStats`

Purpose: Daily store view aggregate.

| Category | Fields |
|---|---|
| Current | `storeId`, `storeName`, `dateKey`, `count`, `updatedAt` |
| Planned canonical | Verified `storeId`, `dateKey`, server-maintained `count`, timestamps |
| Legacy | Name-based identity; records missing `storeId` |
| Migration needed | Populate verified `storeId`; move writes to trusted backend; confirm whether this collection is still consumed |

## `pricingCatalog`

Purpose: Public canonical pricing and store-publication flow configuration.

The active catalog is stored at `pricingCatalog/current`. Field names use
camelCase. The catalog is public read-only data; every client write, including
an administrator browser session, is denied. A future trusted administration
Function must validate the complete schema before writing through the Admin
SDK.

| Field | Type / allowed value |
|---|---|
| `schemaVersion` | integer, currently `1` |
| `currency` | `"JPY"` |
| `taxIncluded` | `true` |
| `billingMethod` | `"prepaid"` |
| `status` | `"active"` |
| `effectiveFrom` | Timestamp |
| `listingPlans.oneMonth` | `{ planCode: "one_month", label: "1ヶ月", durationMonths: 1, amount: 4980 }` |
| `listingPlans.sixMonths` | `{ planCode: "six_months", label: "6ヶ月", durationMonths: 6, amount: 29800 }` |
| `listingPlans.twelveMonths` | `{ planCode: "twelve_months", label: "12ヶ月", durationMonths: 12, amount: 59760 }` |
| `options.topAd` | `{ optionCode: "top_ad", label: "TOP広告", billingUnit: "month", amount: 15000 }` |
| `options.newJob` | `{ optionCode: "new_job", label: "新着求人掲載", billingUnit: "month", amount: 1000 }` |
| `applicationFlow` | ordered string list: 料金確認, 店舗掲載申請, NOX公式LINE追加, NOX運営から案内, 前払い, 入金確認, 掲載開始 |
| `updatedAt` | Timestamp |
| `updatedBy` | trusted administrator UID |

Changing this catalog never changes an existing contract. Contract amounts are
snapshotted when the contract is created.

Canonical UTF-8 values used by local fixtures:

- `listingPlans.oneMonth.label`: `1ヶ月`
- `listingPlans.sixMonths.label`: `6ヶ月`
- `listingPlans.twelveMonths.label`: `12ヶ月`
- `options.topAd.label`: `TOP広告`
- `options.newJob.label`: `新着求人掲載`
- `applicationFlow`: `料金確認`, `店舗掲載申請`, `NOX公式LINE追加`,
  `NOX運営から案内`, `前払い`, `入金確認`, `掲載開始`

The five labels and all seven `applicationFlow` entries must remain valid
UTF-8 Japanese. They were repaired in the approved production catalog
correction on 2026-07-26.

## `storeContracts`

Purpose: Canonical, immutable-to-clients contract snapshot for each store.

The document is `storeContracts/{storeUid}`. Remaining days are never stored;
clients calculate them from `contractEndAt`. Contract fields are not mixed into
`stores/{uid}`.

| Field | Type / allowed value |
|---|---|
| `schemaVersion` | integer, currently `1` |
| `storeId`, `ownerId` | Auth UID; both equal `{storeUid}` |
| `planCode` | `"one_month"`, `"six_months"`, `"twelve_months"`, or `"custom"` |
| `planLabel` | display snapshot |
| `durationMonths` | positive integer |
| `contractStartAt`, `contractEndAt` | Timestamp |
| `listingAmount` | non-negative integer JPY snapshot |
| `options` | map of purchased option snapshots; option codes use `top_ad` and `new_job` |
| `optionAmount`, `totalAmount` | non-negative integer JPY snapshots |
| `currency` | `"JPY"` |
| `taxIncluded` | `true` |
| `billingMethod` | `"prepaid"` |
| `paymentStatus` | `"not_billed"`, `"awaiting_payment"`, `"paid"`, `"expired"`, or `"suspended"` |
| `listingStatus` | `"pending"`, `"active"`, `"paused"`, `"expired"`, or `"suspended"` |
| `pricingCatalogVersion` | catalog schema/version snapshot |
| `pricingEffectiveFrom` | Timestamp copied from the catalog |
| `createdAt`, `updatedAt`, `statusChangedAt` | Timestamp |
| `createdBy`, `updatedBy` | trusted administrator UID |

An active store can read only its own contract. The fixed active administrator
can read contracts for the management screen. All client creates, updates, and
deletes are denied; only trusted Admin SDK code may write.

The trusted `updateStoreContract` callable snapshots `pricingCatalog/current`,
creates or updates the contract, synchronizes backend-managed publication
caches on the store and all jobs owned by that store, and writes an
`adminAuditLogs/{autoId}` record in one transaction.

Store application approval, store-account registration, and publication are
independent lifecycles:

1. `storeApplications/{id}` records the application and invitation state.
2. `storeInvites/{tokenHash}`, `users/{uid}`, and `stores/{uid}` record
   invitation redemption and account registration.
3. `storeContracts/{uid}` is the contract source of truth.
4. `stores/{uid}.isPublic`, `contractListingStatus`, and `contractEndAt` are
   backend-managed publication caches.
5. `jobs/{jobId}.isPublic` and `contractListingStatus` are synchronized by the
   backend and cannot be changed by a store client.

A store is publishable only when payment is `paid`, listing status is `active`,
the current time is inside the contract period, and the store publication cache
is `true`. Registration completion alone never implies publication.

## Phase 1 audit outputs

The read-only audit must report:

1. `users` counts grouped by `role` and `status`.
2. `stores` records missing `ownerId`, and document ID/`ownerId` mismatches.
3. `jobs` records missing `ownerId`, `storeId`, or `status`.
4. `applications` records missing `applicantId`, `storeId`, or `jobId`.
5. `jobEntries` count and observed field names.
6. `jobApplications` records missing `ownerId` or `submittedBy`.
7. `jobViewStats` and `storeViewStats` records missing `storeId`.
8. Duplicate non-empty store names across `stores`.
9. Records whose owner cannot be determined without name-based guessing.

The audit must not mutate Firebase, upload files, modify Authentication users, or
deploy rules.
