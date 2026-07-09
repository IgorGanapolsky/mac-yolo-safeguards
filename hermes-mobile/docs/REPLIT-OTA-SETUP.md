# Hermes Mobile — Replit Agent OTA setup

Use this doc when Replit Agent asks **“Where should the OTA workflow live?”**

## Source of truth (production)

| Item | Value |
|------|-------|
| **Canonical repo** | [IgorGanapolsky/mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards) |
| **App path** | `hermes-mobile/` (monorepo subdirectory — **not** a standalone repo) |
| **OTA workflow** | `.github/workflows/mobile-ota.yml` (PR [#73](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/73), commit `e27d28db`) |
| **GitHub secret** | `EXPO_TOKEN` (already set on mac-yolo-safeguards) |
| **EAS project ID** | `4ed13e30-9b97-4ddd-8a12-59106cae90d6` |
| **Production channel** | `production` |
| **Runtime version** | `appVersion` (`hermes-mobile/app.json` → `runtimeVersion.policy`) |

**Production OTA publishes from mac-yolo-safeguards only.** Merge fixes to `main` there; CI runs unit + release-safety, then `eas update --channel production`.

Replit is for **dev/preview**. Do not treat a Replit fork as the production OTA source unless you intentionally want a separate channel.

## Replit Agent UI — which option to pick

Replit typically offers three choices:

| Option | When to use |
|--------|-------------|
| **1 — Push Replit monorepo to GitHub** (`artifacts/hermes-mobile`) | Replit has its **own** GitHub repo separate from mac-yolo-safeguards. Copy [`.github/workflows/mobile-ota-replit-monorepo.yml.example`](../../.github/workflows/mobile-ota-replit-monorepo.yml.example) into that repo. Use **`preview`** channel unless you mean to fork production. |
| **2 — Standalone hermes-mobile at repo root** | Rare; only if the app lives at repo root. See [OTA_STANDALONE_REPO.md](./OTA_STANDALONE_REPO.md). |
| **3 — User wires GitHub + EXPO_TOKEN themselves** | **Recommended when mac-yolo-safeguards is already configured.** OTA is implemented there; `EXPO_TOKEN` is set; merge PR #73 to enable CI on `main`. Replit does not need a duplicate production workflow. |

**Default answer for Igor’s setup:** pick **Option 3**. Production OTA already lives on mac-yolo-safeguards. Replit is a dev sandbox — sync changes via PR to mac-yolo-safeguards for production OTA.

## Replit monorepo layout (Option 1)

If Replit pushes a monorepo with the app at `artifacts/hermes-mobile`:

1. Copy `.github/workflows/mobile-ota-replit-monorepo.yml.example` → `.github/workflows/mobile-ota.yml` in the **Replit GitHub repo**.
2. Add `EXPO_TOKEN` as a repo secret (Expo dashboard → Access tokens — never commit the value).
3. Prefer **`preview`** channel for Replit CI so you do not overwrite production users:

   ```bash
   eas update --channel preview --environment preview
   ```

4. Point Replit dev at the same EAS project ID (`4ed13e30-9b97-4ddd-8a12-59106cae90d6`) only if builds share runtime version; otherwise use a separate EAS project for experiments.

Key path differences vs mac-yolo-safeguards:

| mac-yolo-safeguards | Replit monorepo |
|---------------------|-----------------|
| `paths: hermes-mobile/**` | `paths: artifacts/hermes-mobile/**` |
| `working-directory: hermes-mobile` | `working-directory: artifacts/hermes-mobile` |
| `cache-dependency-path: hermes-mobile/package-lock.json` | `cache-dependency-path: artifacts/hermes-mobile/package-lock.json` |

## Dev → production flow

```
Replit (dev/preview)
    │
    ├─► Option A: PR / merge to mac-yolo-safeguards main → production OTA (CI)
    │
    └─► Option B: Replit-only preview OTA (preview channel, separate workflow)
```

1. Develop in Replit (`artifacts/hermes-mobile`).
2. Open PR to `IgorGanapolsky/mac-yolo-safeguards` → `main` (app changes under `hermes-mobile/`).
3. After merge, `.github/workflows/mobile-ota.yml` publishes to **`production`** automatically.

## Pasteback for Replit Agent UI

Copy the contents of [`../scripts/replit-ota-pasteback.txt`](../scripts/replit-ota-pasteback.txt) into the Replit Agent prompt when it asks where OTA should live.

## Related docs

- [OTA_UPDATES.md](./OTA_UPDATES.md) — channel strategy, runtime version, what OTA can fix (on `feat/eas-ota` / after PR #73 merge)
- [OTA_STANDALONE_REPO.md](./OTA_STANDALONE_REPO.md) — standalone repo variant (Option 2)
- Canonical workflow: `.github/workflows/mobile-ota.yml` (mac-yolo-safeguards)
- Replit monorepo template: `.github/workflows/mobile-ota-replit-monorepo.yml.example`
