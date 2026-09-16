# Continuity store entitlement (control plane)

## Endpoint

`POST /api/device/entitlements/thumbgate-leash/verify`

Requires signed device headers (`x-hermes-device`, `x-hermes-timestamp`,
`x-hermes-nonce`, `x-hermes-signature`).

Body (same shape as hermes-relay):

Android example:

```json
{
  "platform": "android",
  "product_id": "thumbgate_leash_monthly",
  "purchase_token": "..."
}
```

iOS example (use `transaction_id` and/or `signed_transaction`):

```json
{
  "platform": "ios",
  "product_id": "thumbgate_leash_monthly",
  "transaction_id": "..."
}
```

## Behavior

- Active verified store entitlement -> `organizations.plan = pro` (preserves `team`), persists `store_entitlement_expires_at`, HTTP 200
- Inactive / expired -> HTTP 402 (`subscription_not_active`) — plan not upgraded
- Invalid product / platform / token shape -> HTTP 400
- Suspended org -> HTTP 403
- Verifier bindings missing for that platform -> HTTP 503 fail-closed

Hosted submit (`POST /api/device/tasks/submit`) already gates cloud route via
`evaluateTaskAdmission` -> `hasCloudContinuationAccess` (trial/pro/team).
A local client flag alone does not authorize hosted Continuity.

## Cloudflare Worker bindings for live store verification

Set these on the production Worker (values never in git):

| Binding | Purpose |
|---------|---------|
| `GOOGLE_PLAY_PACKAGE_NAME` | Android package (`com.iganapolsky.hermesmobile.paid`) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Developer API service-account JSON |
| `APPLE_BUNDLE_ID` | iOS bundle id |
| `APPLE_APP_STORE_ISSUER_ID` | App Store Connect API issuer |
| `APPLE_APP_STORE_KEY_ID` | App Store Connect API key id |
| `APPLE_APP_STORE_PRIVATE_KEY` | App Store Connect API PKCS8 PEM |
| `APPLE_APP_STORE_ENVIRONMENT` | optional `Sandbox` |

`createStoreReceiptVerifier` selects Google/Apple live adapters when the matching
bindings are present; otherwise that platform returns 503
`store_verifier_not_configured` (fail closed). Unit tests inject a verifier
double via `setStoreReceiptVerifierForTest`.
