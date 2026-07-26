# Deep Research: React Native / Expo Versioning, Git Tagging, Rollback & Regression Prevention (July 2026)

**Run ID**: `trun_fc3268d892f541d6a60e7e6bf2f9cdf4`  
**Date**: July 2026  
**Target Architecture**: Expo 55, React Native 0.83, EAS Update, Hermes Mobile  

---

## 1. Versioning & Git Tagging Strategy

### 1.1 Coordinated Three-Layer Versioning
| Layer | Field | Purpose | Example |
|-------|-------|---------|---------|
| **Marketing Version** | `version` (`CFBundleShortVersionString`) | User-facing App Store / Play Store version | `0.1.0` |
| **Build Number** | `buildNumber` (`versionCode` on Android) | Monotonic integer for store submissions | `19` |
| **Runtime Version** | `runtimeVersion` (`app.json`) | Defines compatibility gate for EAS OTA updates | `{"policy": "appVersion"}` |

### 1.2 Git Tagging Protocol
- Annotated & Signed Tags: `git tag -a -s vX.Y.Z -m "Release vX.Y.Z"`
- Never rewrite or delete published release tags.
- Tag Hotfixes explicitly: `vX.Y.Z-hotfix.1`

---

## 2. EAS OTA Update Safety Rules

1. **Package ID Immutability**:
   - Live Google Play Store package is **`com.iganapolsky.hermesmobile`**.
   - NEVER alter `android.package` in `app.json` for live OTA channels; changing package ID breaks update delivery to live users.

2. **Staged Rollouts**:
   - Ramping: `1%` (1h) → `10%` (4h) → `50%` (overnight) → `100%`.
   - Command: `npx eas-cli update --branch production --rollout-percentage 10`

3. **Instant Rollback Runbook**:
   ```bash
   # Emergency rollback to previous known-good group ID:
   npx eas-cli update:rollback --group-id <previousGroupId>
   ```

---

## 3. Shift-Left Regression Prevention Gates

- **Unit & Contract Tests**: `npm test` (`243/243` test suites green).
- **Release Safety Gate**: `npm run test:release-safety` verifies package identity, permissions, and runtime policy.
- **EAS Billing Guard**: `HERMES_OTA_BILLING_THAW=1` required for intentional OTA releases.
