# Play paid download (`com.iganapolsky.hermesmobile.paid`) — July 2026

## Product decision

- iOS paid download: **$9.99** (live)
- Android paid download (new package): **$4.99** (Igor override; free package keeps `$4.99` IAP)
- Free→Paid on `com.iganapolsky.hermesmobile` is **impossible** (Google policy)

## Identifiers

| Item | Value |
|------|--------|
| Developer | IgorGanapolsky (`5120393192891708058`) |
| Paid app id | `4972002147362988720` |
| Paid package | `com.iganapolsky.hermesmobile.paid` |
| Free package | `com.iganapolsky.hermesmobile` (stays free + IAP) |
| Code PR | [#608](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/608) merged → squash `b0854f1f` |

## EAS

- Profile: `production-android-paid` (`HERMES_ANDROID_STORE_SKU=paid`)
- Build (2026-07-20): `aafdd2dc-18ff-4d43-b5ac-75518e6d1e74` — **FINISHED**
  - https://expo.dev/accounts/igorganapolsky/projects/hermes-mobile/builds/aafdd2dc-18ff-4d43-b5ac-75518e6d1e74
  - AAB artifact: https://expo.dev/artifacts/eas/fE8gxenciksKsv_A9gv4gx9rgo6fAp9gFiMj6cQ7TbQ.aab
  - versionCode **15** (local copy: `/tmp/hermes-paid-aab/hermes-mobile-paid-vc15.aab`, ~28MB)
- Starter credits at 100%; build proceeded on pay-as-you-go
- EAS generated a **new Android keystore** for the paid applicationId (expected; different package)
- Upload blocked until SA has App permissions on `.paid` (Publisher API `edits` still **403**)

## Live store proof (re-check before ship claims)

```bash
curl -sI -A Mozilla/5.0 "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US"
# expect HTTP 200 + Paid when live; 404 while draft
```

## Remaining Console blockers (exact)

1. **Publisher SA 403 on `.paid`** — `hermes-mobile-publisher@hermes-mobile-play.iam.gserviceaccount.com` has App permissions for free package only. Need **Add app** → paid package → Admin (or Release + Store presence) → **Save changes**. Until then Android Publisher API cannot upload/edit `.paid`.
2. **App pricing** — `/paid-app` shows Paid + Digital app sales, but country prices still `-`. Need **Set pricing** → all countries → **$4.99** → Save. Sticky “Edit product tax category” sheet often blocks automation.
3. **Dashboard setup** — ~1/13 complete (merchant account). Still need privacy policy, ads declaration, content rating, target audience, data safety, store listing, etc.
4. **Apply for access to production** questionnaire may appear for this new app before production track publish (closed-test answers). Internal testing upload may still work once SA + pricing + listing minimums are done.

## Do not claim

- Do **not** claim Play paid download is live until public details URL returns 200 with non-zero price.
- `e2e=skipped` in continuous proofs is not a ship gate for OTA; this track is a new native package (store binary), not OTA.
