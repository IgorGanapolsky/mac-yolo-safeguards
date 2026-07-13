# GKD testing complement (pilot)

**Verdict: pilot only — do not replace Maestro.**

[GKD](https://github.com/gkd-kit/gkd) (`li.songe.gkd`) is an Android accessibility app that taps UI nodes from subscription rules. It is useful for **dogfood recovery taps** (stuck run / Start fresh / Switch computer) while Maestro remains the CI/continuous E2E source of truth under `.maestro/` and `com.igor.hermes-mobile-continuous-e2e`.

## When to use GKD

| Use | Why |
|-----|-----|
| Mega-session stall CTA | Auto-tap **Start fresh chat** when summarization stub leaves the chat looking done |
| Stuck run banner | Tap **Stop stuck run** / **Stop run** during long dogfood sessions |
| Heal exhausted | Prefer **Switch computer** when **Still checking your computer link** lingers |

## When NOT to use GKD

- PR gates, CI, LaunchAgent continuous E2E — keep Maestro
- Fresh-user onboarding assertions — Maestro owns copy/CTA contracts
- Anything that must prove release APK behavior without accessibility services

## Artifacts

| Path | Purpose |
|------|---------|
| [`gkd/hermes-mobile-subscription.json`](../gkd/hermes-mobile-subscription.json) | Minimal subscription for `com.iganapolsky.hermesmobile` |
| [`scripts/install-gkd-hermes.sh`](../scripts/install-gkd-hermes.sh) | `adb` install latest GKD APK from GitHub releases + push subscription |

## Install (agent / USB phone)

```bash
bash hermes-mobile/scripts/install-gkd-hermes.sh
```

Accessibility enable + import must still happen once on-device (stock Android blocks granting Accessibility via `adb`).

## Rule targets (v1)

1. `[text="Stop stuck run"]` / `[text="Stop run"]`
2. `[text="Start fresh chat"]` and text containing `Earlier conversation summarized`
3. `[text="Switch computer"]` when heal-exhausted copy is visible

Update selectors if UX copy changes; keep Maestro flows as the regression gate.
