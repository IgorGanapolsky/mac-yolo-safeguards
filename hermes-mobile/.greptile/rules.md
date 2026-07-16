# Greptile — hermes-mobile/ overrides

Inherits repo-root `.greptile/`. Extra focus for app code:

1. **Stranger cold-start** — `ConnectMacGate` + `connect-mac-onboarding-card` without demo deep link.
2. **Heal before homework** — ~30s silent heal for saved profiles before numbered steps.
3. **Tailscale in picker** — cellular users see Tailscale Add-[name] near the top, not Settings-only.
4. **Wrong-key XOR** — never Connected + Wrong key simultaneously.
5. **Release path** — phone install via `android:phone` / `install-phone-release.sh` only.

Context files: see root `.greptile/files.json` and `docs/GREPTILE-CODE-REVIEW.md`.
