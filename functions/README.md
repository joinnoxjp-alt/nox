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

## Local-only commands

After dependency installation is approved:

```powershell
npm --prefix functions run typecheck
npm --prefix functions run build
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
