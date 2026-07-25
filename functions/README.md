# NOX Firebase Functions

This directory is the trusted backend boundary for NOX store onboarding.

## Current phase

Only the TypeScript project structure and fail-closed callable placeholders
exist. Every exported callable throws `unimplemented`. No invite validation,
token generation, Firestore transaction, data access, or deployment logic has
been implemented.

## Planned callable functions

- `approveStoreApplicationAndIssueInvite`
- `getStoreInvitePreview`
- `redeemStoreInvite`
- `revokeStoreInvite`
- `reissueStoreInvite`

## Discord operations notifications

The following second-generation Firestore triggers share one server-side
notifier and one Secret Manager secret:

- `notifyDiscordOnUserCreated` for `users/{uid}`
- `notifyDiscordOnJobApplicationCreated` for
  `jobApplications/{applicationId}`
- `notifyDiscordOnStoreApplicationCreated` for
  `storeApplications/{applicationId}`

The secret name is `DISCORD_OPERATIONS_WEBHOOK_URL`. Its value must never be
committed, logged, returned to clients, or used by local tests. Local tests
inject a mock sender.

Delivery claims are stored at `discordNotifications/{eventKey}`, where
`eventKey` is a SHA-256 hash of the event type and source document path.
Records contain no notification payload or source document ID. Automatic
Eventarc retries are disabled. A known HTTP failure is recorded as `failed`;
an unexpected process termination can leave `processing` for administrator
review. This at-most-once policy favors preventing duplicate Discord messages
over automatic retries.

The legacy browser POSTs in `pages/register.html` and
`pages/job-create.html` remain temporarily. They must be removed in the same
production release that enables these triggers to avoid duplicate messages.

## Runtime

- Cloud Functions for Firebase, 2nd generation
- Node.js 22
- Region: `asia-northeast1`

## Dependencies

Runtime:

- `firebase-admin@14.2.0`
- `firebase-functions@7.3.0`

Development:

- `typescript@5.9.3`
- `@types/node@22.20.1`
- `firebase-tools@15.24.0`

Dependencies have not been installed in this phase. `package-lock.json` must be
generated when installation is separately approved.

## Invite security utilities

The shared invite utilities use Node.js standard APIs only:

- 256-bit tokens from `randomBytes(32)` encoded as Base64URL
- SHA-256 token hashes encoded as lowercase hexadecimal
- trimmed, lowercase invite email normalization
- fixed error codes and messages that do not disclose tokens or email addresses

The utilities do not log sensitive values or initialize any Firebase service.

## Store invite preview

`getStoreInvitePreview` is the only implemented callable in this phase. It:

- accepts an exact 43-character Base64URL invite token;
- hashes the token before reading `storeInvites/{tokenHash}`;
- returns only a store name, masked email hint, expiration, and business scope
  when unauthenticated;
- additionally returns only a boolean email-match result when authenticated,
  comparing normalized Auth and invite email addresses on the server;
- supports `night`, `general`, and `both`;
- treats a missing legacy business scope as `night`;
- gives unavailable invites one generic public error.

Integration tests refuse to run unless `GCLOUD_PROJECT` is `demo-nox-local`
and `FIRESTORE_EMULATOR_HOST` points to the local Firestore emulator.

## Local-only commands

After dependency installation is approved:

```powershell
npm --prefix functions run typecheck
npm --prefix functions run build
npm --prefix functions test
npm --prefix functions run emulators
```

The emulator script uses the demo project ID `demo-nox-local`. It must not use
production data or deploy any function.

## Security boundary

- Clients must never assign `role` or `status`.
- Clients must never create the initial `stores/{uid}` document.
- Invite redemption and privilege assignment will be implemented in a trusted
  callable function and a Firestore transaction.
- No service-account key or other credential may be stored in this directory.
