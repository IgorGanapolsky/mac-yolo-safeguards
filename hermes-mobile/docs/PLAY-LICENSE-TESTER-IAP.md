# Play license tester — Leash Pro IAP proof

**Product:** `thumbgate_leash_monthly` @ $19.99/mo  
**Package:** `com.iganapolsky.hermesmobile`  
**Updated:** 2026-07-12

## Prerequisites

1. Play Console app published (internal / closed / production) with subscription active.
2. License tester Google account added: Play Console → **Settings → License testing**.
3. Release APK on device (`npm run android:phone`) — not Metro debug.
4. Tester signed into Play Store on the phone with the license-tester account.

## Proof flow (agent-runnable when `R3CY90QPM7E` or other device connected)

```bash
cd hermes-mobile
npm run android:phone   # release install
adb shell monkey -p com.iganapolsky.hermesmobile -c android.intent.category.LAUNCHER 1
```

On device (Maestro can automate Leash tab navigation):

1. Open **Leash** tab.
2. If free allowance remains: use approvals until paywall OR tap **Subscribe** on `ProUpgradeCard`.
3. Complete Play purchase dialog (license testers are not charged).
4. Confirm Leash tab shows unlimited state (no “X of 10 free” banner).
5. PostHog should emit `leash_purchase_result` with `status=purchased`.

## Restore path

Settings → Leash → **Restore purchases** (or `ProUpgradeCard` restore). Expect `leash_restore_result` in PostHog.

## Evidence to capture

| Artifact | Where |
|----------|--------|
| `leash_paywall_view` | PostHog live events |
| `leash_purchase_result` | PostHog |
| Play order ID | Play Console → Order management (test orders) |
| Screenshot | Paywall + subscribed state |

## Blockers (human-only)

- Play merchant / tax profile incomplete → purchases fail with billing unavailable.
- Subscription not **Active** in Play Console → SKU not found.
- Wrong Google account on device → purchase succeeds on wrong tester.

## Related

- [PROMOTION-PLAYBOOK.md](./PROMOTION-PLAYBOOK.md) — spend gates
- [MONETIZATION-GTM-JULY-2026.md](./MONETIZATION-GTM-JULY-2026.md) — pricing
- `src/services/thumbgateIap.ts` — IAP wiring
