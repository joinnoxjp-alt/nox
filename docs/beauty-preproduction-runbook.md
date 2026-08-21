# NOX BEAUTY pre-production runbook

## Safety rules

- Always run the seed command without `--commit` first.
- Use project ID `demo-nox-local` with the Firestore Emulator for rehearsal.
- Seeded brands and products remain `isPublic: false`.
- Production writes require both the exact project ID `noxapp-29171` and the explicit `--allow-production` flag.
- Do not use `--update-existing` unless the printed collision list has been reviewed.

## Emulator rehearsal

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
node scripts/seed-beauty.mjs --project=demo-nox-local
node scripts/seed-beauty.mjs --project=demo-nox-local --commit
```

The first command is a dry-run. The second writes only to the emulator.

## Production procedure after approval

```powershell
node scripts/seed-beauty.mjs --project=noxapp-29171
node scripts/seed-beauty.mjs --project=noxapp-29171 --commit --allow-production
```

The seed operation creates the MIRÈIO brand and four products as private. Upload media and verify previews before changing `isPublic` in the administrator page.

## Media placement

| Number | Admin target | Public target |
| --- | --- | --- |
| ① | Brand `heroMedia` | Brand page first view |
| ② | AMPOULE first detail image | AMPOULE detail body |
| ③ | MIST first detail image | MIST detail body |
| ④ | CREAM first detail image | CREAM detail body |
| ⑤ | Brand `storyMedia` | “MIRÈIOとは？” |
| ⑥ | Brand `stepMedia` | 3STEP section |
| ⑦ | Brand `trustMedia` | Trust/manufacturing section |
| ⑧ | Brand `purchaseMedia` | Immediately before the purchase CTA |
| ⑨–⑫ | Brand `extraMedia` | Configured position and order |

## Release gate

Before publication, verify a real image and MP4 upload, order creation through the callable function, status transitions, shipping confirmation, both settlement triggers, mobile layout, and Rules Emulator denial cases.
