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
- EAS generated a **new Android keystore** for the paid applicationId (expected; different package)

## Live store proof (re-check before ship claims)

```bash
curl -sI -A Mozilla/5.0 "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US"
# expect HTTP 200 + Paid when live; 404 while draft
```

## Progress (2026-07-20 — cursor-play-paid-live)

| Step | Status | Evidence |
|------|--------|----------|
| SA App Admin on `.paid` | **done** | Publisher API `edits` **200** |
| EAS `production-android-paid` AAB | **done** | build `aafdd2dc…` FINISHED, vc **15** |
| AAB upload | **done** | internal track release `paid-15`, status **completed** |
| Store listing en-US + contact | **done** | API title `Hermes Mobile`; contact from free app |
| Store graphics | **done** | icon=1, featureGraphic=1, phoneScreenshots=6 via Publisher API from `fastlane/metadata/android/en-US/images/` |
| Country prices **$4.99** | **done** | Console `/paid-app`: United States **USD 4.99**; dashboard checklist **Set the price of your app** checked; Digital app sales tax category |
| Privacy policy URL | **done** | `https://thumbgate.ai/privacy` — “Change saved” |
| Ads declaration | **done** | No ads — “Change saved” |
| Government apps | **done** | No — “Change saved” |
| Financial features | **done** | No financial features — “Change saved” |
| Health apps | **done** | No health features — “Change saved” (may still show under Need attention until refresh) |
| Sign in / testing credentials | **in progress** | Yes (restricted) + demo instructions; Add-details sheet flaky / Chrome crash |
| Content rating / Target audience / Data safety / Advertising ID | **pending** | App content “Need attention (6)” when last checked |
| Production access questionnaire | **pending** | not submitted |
| Production track release | **pending** | production track empty; internal has `paid-15` |
| Public live | **no** | store details URL **404** |

## Remaining Console blockers (exact)

1. Finish **Sign in details** (Add details → demo-mode instructions → Save).
2. **Content rating** (IARC questionnaire).
3. **Target audience**.
4. **Data safety** (PostHog analytics — see `docs/DATA-SAFETY.md` / free-app answers).
5. **Advertising ID** declaration (app does not use IDFA/AAID for ads).
6. Confirm Health declaration cleared if still listed.
7. **Apply for access to production** questionnaire if still shown.
8. Promote `paid-15` (or new) to **production** + **Send for review**.

## Do not claim

- Do **not** claim Play paid download is live until public details URL returns 200 with non-zero price.
- `e2e=skipped` in continuous proofs is not a ship gate for OTA; this track is a new native package (store binary), not OTA.
