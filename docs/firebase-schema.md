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
| Migration needed | Find missing/mismatched `ownerId`; verify document ID; resolve duplicate store names manually; stop using names for authorization |

## `jobs`

Purpose: Public and administratively managed job listings.

| Meaning | Current fields | Planned canonical | Legacy fields |
|---|---|---|---|
| Ownership | `ownerId`, `storeId`, `userId` | `ownerId` | `storeId`, `userId` as owner aliases |
| Store display name | `storeName`, `name`, `shopName`, `storeTitle` | `storeName` | `name`, `shopName`, `storeTitle` |
| Business/job type | `businessType`, `jobType`, `position`, `genre`, `type` | `businessType`, `position` | `jobType`, `genre`, `type` where ambiguous |
| Audience | `targetGender`, `gender`, `jobAudience`, `audience`, `target` | `targetGender` | remaining aliases |
| Men's category | `menCategory`, `jobCategory`, `category` | `menCategory` | `jobCategory`, `category` |
| Title | `title`, `jobTitle` | `title` | `jobTitle` |
| Description | `description`, `jobDescription`, `storeDescription`, `selfPr`, `pr`, `shopPR` | `description`, optional `storeDescription` | ambiguous aliases |
| Location | `area`, `location`, `prefecture`, `address`, `station` | `area`, `address`, `station` | `location`, `prefecture` |
| Salary | `salary`, `salaryText`, `back`, `dailyPay`, `trial` | `salaryText` plus structured salary later | duplicate `salary` |
| Hours | `workHours`, `workingHours`, `shift`, `businessHours`, `closedDay` | `workHours`, `businessHours`, `closedDay` | `workingHours`; ambiguous `shift` |
| Requirements | `requirements`, `qualification`, `conditions`, `beginner`, `age`, `quota`, `penalty` | `requirements` plus structured flags | aliases |
| Benefits | `benefits`, `treatment`, `features` | `benefits` | aliases |
| Contact | `applyUrl`, `lineUrl`, `contactUrl`, `officialLine`, `applicationPhone`, `contactName`, `contactInfo`, `website`, social URLs | explicit contact fields | generic URL aliases |
| Images | `images`, `image`, `imageUrl`, `mainImage`, `logoUrl` | `images`, `mainImage` | single-image aliases |
| Publication | `status`, `isPublished`, `topFeatured`, `topOrder` | `status`, `topFeatured`, `topOrder` | `isPublished` |
| Source/audit | `sourceApplicationId`, `approvedAt`, `approvedBy`, `createdAt`, `republishedAt`, pause/feature timestamps | source and audit timestamps | none |
| Test flags | `isTest`, `isDummy` | no production test records | both flags |

Planned canonical status values include `approved` and `paused`; pending
publication data remains in `jobApplications`, not `jobs`.

Migration needed:

- Populate a verified `ownerId` for every job.
- Do not infer ownership from `storeName` when names are duplicated.
- Normalize audience, business type, title, area, salary and image fields.
- Resolve conflicting `status` and `isPublished`.
- Deduplicate jobs sharing the same `sourceApplicationId`.
- Separate test/dummy documents from production data.

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

Purpose: Job-seeker application sent to a store.

| Category | Fields |
|---|---|
| Current target | `jobId`, `storeId`, `storeName` |
| Current applicant | `applicantName`, `applicantPhone`, `message` |
| Current workflow | `status`, `createdAt` |
| Planned canonical | `jobId`, `storeId`, `applicantId`, applicant fields, `status`, `createdAt`, `updatedAt` |
| Legacy/missing | Records without `applicantId`; `storeName` used as fallback ownership |
| Migration needed | Derive `storeId` only from a verified job owner; attach `applicantId` only when deterministically known; isolate records whose applicant cannot be identified |

Planned status values: `new`, `progress`, `hired`, `ng`.

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
