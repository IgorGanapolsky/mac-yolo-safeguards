# Hermes Mobile — Data Safety / Privacy source of truth

Single source of truth for the **Google Play Data Safety form**, the **Apple privacy nutrition
label** (`NSPrivacyCollectedDataTypes`), and any privacy policy. Update this file whenever an
SDK that collects data is added, removed, or reconfigured, then reconcile the two store forms.

Bundle id: `com.iganapolsky.hermesmobile` · Publisher: Max Smith KDP LLC.

## What the app actually collects (verified against the bundled SDKs)

| Data | Source (SDK) | Purpose | Shared w/ 3rd party | Linked to user | Optional |
|---|---|---|---|---|---|
| Product interaction / in-app events | PostHog (`posthog-react-native`) | Analytics | Yes (PostHog Inc.) | Yes (via `distinct_id`) | Yes — `analyticsOptOut` |
| Device / installation ID (`distinct_id`) | PostHog | Analytics | Yes (PostHog) | Yes | Yes |
| Push token | Firebase Cloud Messaging (`expo-notifications`) | Push notifications | Processor (Google) | Yes | N/A (only if notifications enabled) |
| Purchase history | Play Billing / `expo-iap` | App functionality (paid upgrade) | Processor (Google/Apple) | Yes | N/A |
| Camera (QR frames) | `expo-camera` | Pairing QR scan **only**; frames processed on-device, **not** stored or transmitted | No | No | Yes |

Not collected: name, email, precise/coarse location, contacts, photos/media library, health,
financials beyond the store purchase record, **IDFA / advertising ID** (no ads, no ATT prompt).
The gateway API key and pairing data are stored **on-device** (Keychain/Keystore) and sent only
to the user's own computer — not to us.

## Google Play Data Safety form — answers
- **Does your app collect or share user data?** Yes.
- Data types: **App activity** (product interaction) + **Device or other IDs** (PostHog `distinct_id`).
- **Shared** with a third party: Yes — PostHog (analytics). FCM/Billing are processors, not "shared".
- **Encrypted in transit:** Yes (HTTPS/TLS to PostHog; the gateway link is user-configured).
- **User can request deletion:** Yes (analytics opt-out + PostHog deletion on request).
- **Collection optional:** Analytics is optional via in-app `analyticsOptOut`.

## Apple privacy label — `NSPrivacyCollectedDataTypes`
Declared in `app.json` (`expo.ios.privacyManifests.NSPrivacyCollectedDataTypes`) as of 2026-07-03:
- `NSPrivacyCollectedDataTypeProductInteraction` — purpose Analytics, linked, **not** used for tracking.
- `NSPrivacyCollectedDataTypeDeviceID` (the PostHog `distinct_id`) — purpose Analytics, linked, not tracking.
- Tracking = **false** across the board (no IDFA, no ATT).

Keep this in sync with the App Store Connect privacy questionnaire, which must answer identically.

## Pre-submission checklist
- [x] `NSPrivacyCollectedDataTypes` in `app.json` matches the Apple table above (done 2026-07-03).
- [ ] Play Console Data Safety form matches the table above.
- [ ] `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are blocked (done in `app.json` `android.blockedPermissions`).
- [ ] Apple granular age-rating questionnaire re-answered for AI-chatbot content.
- [ ] Privacy policy URL published and linked in both stores.
