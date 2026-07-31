# Monetization: paid app, full features, optional web plans

**Product lock (2026-07-26):** Hermes Mobile is a paid download with all
native features included. It has no in-app purchase, restore-purchase, free
tier, or second unlock. Optional ThumbGate Continuity plans are sold on the
ThumbGate web dashboard.

## What the user pays

| Platform | Primary gate (in/around the app) | Subscription |
|----------|----------------------------------|--------------|
| **iOS** | Paid App Store download; all mobile features included | Web dashboard only |
| **Android** | Paid Google Play download; all mobile features included | Web dashboard only |

## App code contract

- `isStorePaidDownloadEntitled()` is true for every Hermes Mobile store package.
- `expo-iap`, its config plugin, and its native billing keep rules are absent.
- No mobile source renders an unlock, restore, free-tier, or purchase CTA.
- ThumbGate web promotion is additive and links to its separate plans.

## ASC / Play

- Retired store products remain removed from sale.
- No retired product identifier may be reattached to a mobile CTA.

## Tests

- `src/__tests__/noInAppPurchaseContract.test.ts`
- `src/__tests__/paidDownloadNoPaywallContract.test.ts`
