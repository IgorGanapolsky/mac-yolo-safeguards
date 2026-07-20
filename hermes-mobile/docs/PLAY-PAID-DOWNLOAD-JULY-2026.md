# Play paid download (`com.iganapolsky.hermesmobile.paid`) — July 2026

## Product decision

- iOS paid download: **$9.99** (live) — https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037
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
| Status docs PR | [#614](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/614) |

## EAS / AAB

- Profile: `production-android-paid` (`HERMES_ANDROID_STORE_SKU=paid`)
- Build: `aafdd2dc-18ff-4d43-b5ac-75518e6d1e74` — **FINISHED**, versionCode **15**
- Artifact: https://expo.dev/artifacts/eas/fE8gxenciksKsv_A9gv4gx9rgo6fAp9gFiMj6cQ7TbQ.aab
- Uploaded to Play **internal** track as release `paid-15` (**completed**)
- Production track: empty (not promoted yet)
- New keystore for `.paid` applicationId (expected)

## Live store proof

```bash
curl -sI -A Mozilla/5.0 "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US"
# 2026-07-20: still HTTP 404 — not publicly live
```

## Progress (2026-07-20 — cursor-play-paid-live)

| Step | Status | Evidence |
|------|--------|----------|
| SA App Admin on `.paid` | **done** | Publisher API `edits` **200** |
| EAS AAB vc15 | **done** | build `aafdd2dc…` FINISHED |
| AAB on internal | **done** | track release `paid-15` **completed** |
| Listing + contact | **done** | title `Hermes Mobile`; email/phone/website from free app |
| Store graphics | **done** | icon=1, featureGraphic=1, phoneScreenshots=6 (fastlane assets) |
| Price **$4.99** | **done** | Console US **USD 4.99**; tax **Digital app sales**; dashboard **Set the price of your app** ✓ |
| Privacy policy | **done** | `https://thumbgate.ai/privacy` |
| Ads | **done** | No ads |
| Sign-in details | **done** | dashboard ✓ |
| Advertising ID | **done** | No |
| Government / Financial | **done** | No / none |
| Dashboard checklist | **8 of 13** | remaining below |
| Public live | **no** | store URL **404** |

## Remaining blockers (exact)

Dashboard still needs:

1. **Content rating** (IARC questionnaire)
2. **Target audience**
3. **Data safety** (PostHog analytics — form mid-wizard; deletion URL fields fight AppleScript fill)
4. **Health** declaration (form UI collapsed / incomplete in automation)
5. **App category** (Store settings still “Select a category”; contact already filled)
6. **Apply for access to production** questionnaire if still required
7. Promote `paid-15` → **production** + **Send for review**

## Do not claim

- Do **not** claim Play paid download is live until public details URL returns **200** with Paid/$4.99.
