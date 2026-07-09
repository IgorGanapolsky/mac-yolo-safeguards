# Hermes Mobile OTA — standalone repo layout (Option 2)

Use this only if Hermes Mobile lives at the **repository root** (not under `hermes-mobile/` in mac-yolo-safeguards and not under `artifacts/hermes-mobile` in a Replit monorepo).

**Canonical production setup is not standalone.** Production OTA publishes from [IgorGanapolsky/mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards) at path `hermes-mobile/`. See [REPLIT-OTA-SETUP.md](./REPLIT-OTA-SETUP.md).

## When this applies

- Replit Agent **Option 2**: “Standalone hermes-mobile repo (app at root)”
- A fork or mirror where `app.json`, `eas.json`, and `package.json` sit at repo root

## GitHub Actions workflow

Save as `.github/workflows/mobile-ota.yml` at the **repo root**:

```yaml
# Hermes Mobile OTA — standalone repo (app at root).
# paths: **  working-directory: .
# EAS project: 4ed13e30-9b97-4ddd-8a12-59106cae90d6
# runtimeVersion: appVersion (app.json)
name: Hermes Mobile OTA

on:
  push:
    branches:
      - main
    paths:
      - '**'
      - '!.github/**'
      - '!**/*.md'
      - '.github/workflows/mobile-ota.yml'
  workflow_dispatch:
    inputs:
      message:
        description: Optional OTA publish message
        required: false
        type: string

concurrency:
  group: hermes-mobile-ota-standalone
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality-gate:
    name: Unit + release safety
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json

      - run: npm ci
      - run: npm run release:check
        env:
          REQUIRE_EAS_PROJECT: '1'
      - run: npm run typecheck
      - run: npm run test:ci
      - run: npm run test:release-safety

  publish-production-ota:
    name: Publish production OTA
    needs: [quality-gate]
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json

      - uses: expo/expo-github-action@v9
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
          packager: npm

      - run: npm ci

      - name: Fail fast on required EAS auth
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          set -euo pipefail
          if [ -z "${EXPO_TOKEN:-}" ]; then
            echo "Missing required secret: EXPO_TOKEN" >&2
            exit 1
          fi

      - name: Publish OTA to production channel
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          OTA_MESSAGE: ${{ github.event_name == 'workflow_dispatch' && (inputs.message || format('manual {0}', github.sha)) || format('main {0}: {1}', github.sha, github.event.head_commit.message || 'Hermes Mobile OTA') }}
        run: |
          set -euo pipefail
          eas update \
            --channel production \
            --environment production \
            --non-interactive \
            --message "${OTA_MESSAGE}"

```

## Path / directory summary

| Layout | `paths` filter | `working-directory` | `cache-dependency-path` |
|--------|----------------|---------------------|-------------------------|
| mac-yolo-safeguards (canonical) | `hermes-mobile/**` | `hermes-mobile` | `hermes-mobile/package-lock.json` |
| Replit monorepo | `artifacts/hermes-mobile/**` | `artifacts/hermes-mobile` | `artifacts/hermes-mobile/package-lock.json` |
| Standalone (this doc) | `**` (exclude noise as needed) | `.` | `package-lock.json` |

## Secrets and EAS config

| Setting | Value |
|---------|-------|
| GitHub secret | `EXPO_TOKEN` |
| EAS project ID | `4ed13e30-9b97-4ddd-8a12-59106cae90d6` |
| Production channel | `production` |
| Runtime version | `appVersion` in `app.json` |

**Warning:** Publishing `production` OTA from a standalone fork will affect the same EAS project and channel as mac-yolo-safeguards. Prefer **`preview`** for experimental standalone repos, or use a separate EAS project.

## Local publish (same as monorepo)

```bash
npm run ota:production   # production channel
npm run ota:preview      # preview channel
```

Requires `EXPO_TOKEN` in the environment.
