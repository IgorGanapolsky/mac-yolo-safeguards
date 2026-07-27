# Monetization: paid app + web-only subscription

**Product lock (2026-07-20):** Subscriptions must only be sold on the **ThumbGate web dashboard**. Hermes Mobile never opens a StoreKit / Play **subscription** purchase sheet.

## What the user pays

| Platform | Primary gate (in/around the app) | Subscription |
|----------|----------------------------------|--------------|
| **iOS** | Paid App Store download | Web dashboard only (`THUMBGATE_WEB_SUBSCRIPTION_URL`) |
| **Android** (free package) | One-time Play IAP `hermes_pro_lifetime` ($4.99) | Not sold in-app (monthly deactivated) |
| **Android** (`.paid` package) | Paid download (in flight) | Not sold in-app |

## App code contract

- `IN_APP_SUBSCRIPTION_PURCHASES_ENABLED = false` in `src/services/thumbgateIap.ts`
- `purchaseThumbgateLeash()` never uses `type: 'subs'`; iOS returns `not_configured` and points to web
- Android may still `requestPurchase` **lifetime** `hermes_pro_lifetime` (`type: 'in-app'`)
- `ProUpgradeCard` iOS primary CTA: **Manage on ThumbGate web** (`open-thumbgate-web-subscription`)
- Legacy App Store monthly subscribers may still **Restore** entitlement via `hasActiveSubscriptions`

## ASC / Play

- `thumbgate_leash_monthly` may remain in ASC for grandfathered restores but must not be purchasable from the app
- Prefer `scripts/deactivate-asc-leash-subscription.js` to mark the subscription removed from sale when API allows
- Play monthly already deactivated; do not re-attach as an in-app subscribe CTA

## Tests

- `src/__tests__/noInAppSubscriptionContract.test.ts`
- `src/__tests__/thumbgateIap.test.ts`
- `src/__tests__/ProUpgradeCard.test.tsx`
