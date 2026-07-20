# Play paid download (`com.iganapolsky.hermesmobile.paid`) — July 2026

## Product decision

- iOS paid download: **$9.99** (live) — https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037
- Android paid download (new package): **$4.99** (paid-by-default; **no** in-app subscription on this listing — web dashboard only)
- Free→Paid on `com.iganapolsky.hermesmobile` is **impossible** (Google policy)

## Identifiers

| Item | Value |
|------|--------|
| Developer | IgorGanapolsky (`5120393192891708058`) |
| Paid app id | `4972002147362988720` |
| Paid package | `com.iganapolsky.hermesmobile.paid` |
| Free package | `com.iganapolsky.hermesmobile` (stays free + IAP) |
| Code PR | [#608](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/608) merged → squash `b0854f1f` |

## EAS / AAB

- Profile: `production-android-paid` (`HERMES_ANDROID_STORE_SKU=paid`)
- Build: `aafdd2dc-18ff-4d43-b5ac-75518e6d1e74` — **FINISHED**, versionCode **15**
- Uploaded to Play **internal** as release `paid-15` (**completed**)
- Promoted to **production** as `paid-15` (US country targeting); Console: **Changes in review** (2026-07-20)
- New keystore for `.paid` applicationId (expected)

## Live store proof

```bash
curl -sI -A Mozilla/5.0 "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US"
# 2026-07-20T19:43Z: still HTTP 404 — not publicly live (awaiting Google review publish)
```

## Re-verify 2026-07-20T19:44Z (pricing false alarm)

Sibling reported country prices unset (`-`). **False alarm** — Monetize overview analytics use `-` for Monthly buyers / ARPPU when revenue is $0.

Console `/paid-app` (App pricing) evidence:
- **Your app is Paid**
- Tax category: **Digital app sales**
- **United States → USD 4.99** (No VAT with location overrides)
- Country table populated (not dashes)

Publishing overview: **Changes in review** / **Remove changes** — Production `paid-15` Start full rollout; Countries: United States.

App content → Actioned: **10** declarations **In review** (Data safety, Health apps, Target audience 18+, Content ratings, Advertising ID, Sign in details, Financial, Government, Ads, Privacy policy). Need attention: empty.

Exact remaining blocker: **Google Play review/publish** (public details URL 404). Console checklist is not the blocker.


## Progress (2026-07-20 — Console evidence)

| Step | Status | Evidence |
|------|--------|----------|
| SA App Admin on `.paid` | **done** | Publisher API `edits` **200** |
| EAS AAB vc15 | **done** | build `aafdd2dc…` FINISHED |
| AAB on internal | **done** | track release `paid-15` **completed** |
| Listing + graphics + $4.99 | **done** | `/paid-app`: Paid; US **USD 4.99**; Digital app sales; assets uploaded |
| Privacy policy | **done** | `https://thumbgate.ai/privacy` |
| Content rating (IARC) | **done** | All Other App Types; ESRB Everyone / PEGI 3 |
| Target audience | **done** | 18+ |
| App category | **done** | Productivity |
| Health | **done** | No health features |
| Data safety | **done** | Collects: Crash logs, Diagnostics, Device IDs; encrypted in transit; no accounts; deletion URL privacy page; Analytics purpose |
| Countries | **done** | **United States** targeted on production |
| Promote `paid-15` → production | **done** | Publishing overview: Production `paid-15` Start full rollout |
| Send for review | **done** | Console: **Changes in review** + **Remove changes** (quick checks then Google review) |
| Public live | **no** | store URL **404** until review completes + publishes |

## Publisher API snapshot (2026-07-20)

- Production track release `paid-15` vc15 status **completed** (edit view) with en-US release notes
- Internal track `paid-15` still **completed**
- Public details URL remains **404** — do not treat API `completed` as user-visible live

## Do not claim

- Do **not** claim Play paid download is live until public details URL returns **200** with Paid/$4.99.
- Do **not** reintroduce monthly IAP on the paid listing.
