# Browser efficiency on the Hermes Macs

Chrome can keep background apps running after its last window closes. That is
useful for extension notifications, but it is wasted resident work on the two
Hermes Macs because intentional browser automation has separately launched CDP
instances. Google's documented policy is `BackgroundModeEnabled`; setting it
to `false` prevents the implicit background mode without terminating an active
browser.

Apply locally and to the Mac mini:

```bash
scripts/configure-browser-efficiency.sh --apply --json
scripts/configure-browser-efficiency.sh --apply --host hermes-mini --json
```

The command reports the setting before and after, Chrome root-process count,
and reachability for the two established Hermes CDP ports. It deliberately:

- does not kill Chrome, helpers, tabs, or CDP processes;
- does not inspect profiles, cookies, extensions, or authenticated sessions;
- does not change page preloading automatically because Chrome exposes that as
  a user performance choice and the linked article recommends Standard rather
  than disabling it outright;
- is idempotent and safe to repeat after Chrome upgrades.

Live verification on 2026-07-15:

| Host | Before | After | CDP proof |
|---|---:|---:|---|
| Igor's MacBook Pro | `0` | `0` | daily Chrome left running |
| Igor's Mac mini | unset | `0` | `:9222` and `:9223` stayed healthy |

Sources:

- [Chrome Enterprise BackgroundModeEnabled policy](https://chromeenterprise.google/policies/background-mode-enabled/)
- [Google Chrome performance settings](https://support.google.com/chrome/answer/12929150)
- [MakeUseOf browser background-process walkthrough](https://www.makeuseof.com/i-disabled-my-browsers-background-processes-and-cut-cpu-usage-in-half/)

