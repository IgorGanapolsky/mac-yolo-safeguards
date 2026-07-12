# Hermes Mobile — Sentry crash reporting

Hermes Mobile reports to **max-smith-kdp-llc**, not **subway-w3**. The subway-w3 `react-native` project (org `o4510699334467584`, project `4510699335974912`) is a different Sentry org — do not use it for Hermes Mobile triage.

## Dashboard (Hermes Mobile events)

- **Issues:** [max-smith-kdp-llc issues (project 4509329571315712)](https://max-smith-kdp-llc.sentry.io/issues/?project=4509329571315712)
- **Org:** `max-smith-kdp-llc` (`o4509329568235520`)
- **Project id:** `4509329571315712`

## Runtime wiring

| Piece | Location | Behavior |
|---|---|---|
| DSN | `EXPO_PUBLIC_SENTRY_DSN` in `.env` (local) / EAS env (cloud) | Baked into release bundle at build time |
| Init | `App.tsx` → `initCrashReporting()` before first render | No-op when DSN unset |
| Root wrap | `withCrashReporting(App)` | `Sentry.wrap` integrations |
| UI crashes | `ErrorBoundary` → `captureException()` | Same dashboard as native/JS |
| Wrapper | `src/services/telemetry.ts` | App imports this, never `@sentry/react-native` directly |
| Expo plugin | `app.json` → `@sentry/react-native` | Native symbol upload hook on EAS/Gradle builds |

## Env vars

| Variable | When | Required for |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | Build + runtime | Event capture (publishable client DSN) |
| `SENTRY_AUTH_TOKEN` | Build only | Source map / debug symbol upload |
| `SENTRY_ORG` | Build only | `max-smith-kdp-llc` |
| `SENTRY_PROJECT` | Build only | Project **slug** (not numeric id) for upload |

**Do not use `hermes-mobile` as `SENTRY_PROJECT`** — that slug does not exist in org `max-smith-kdp-llc` (Gradle `_SentryUpload` HTTP 400: one or more projects are invalid; blocked Android production vc10, 2026-07-11). Runtime events use DSN project id `4509329571315712`; upload needs the dashboard **Project Slug**, still unset in tracked env.

Store production builds (iOS + Android) set `SENTRY_DISABLE_AUTO_UPLOAD=true` until the real slug is set in EAS + `eas.json`.

### Find the project slug

1. Open [max-smith-kdp-llc issues (project 4509329571315712)](https://max-smith-kdp-llc.sentry.io/issues/?project=4509329571315712).
2. **Settings → Projects → [Hermes project] → General Settings**.
3. Copy **Project Slug** — the short name in the project URL (`…/projects/<slug>/`), **not** the numeric id `4509329571315712`.
4. Set `SENTRY_PROJECT=<slug>` in local `.env`, EAS project secrets, and (optionally) `eas.json` production `env`.

CLI (needs `project:read` on the auth token): `sentry-cli projects list --org max-smith-kdp-llc` and match id `4509329571315712`.

Automated lookup via Sentry API returned **403** with the local auth token (insufficient `org:read` / `project:read` scope) — set the slug manually from the dashboard.

## CI / EAS env

| Context | Vars | Why |
|---|---|---|
| GitHub Actions (Gradle prebuild/assemble) | `SENTRY_DISABLE_AUTO_UPLOAD=true` | No `SENTRY_PROJECT` slug in CI secrets — skip symbol upload instead of failing the build |
| EAS production profile | `SENTRY_ORG=max-smith-kdp-llc`; `SENTRY_DISABLE_AUTO_UPLOAD=true` on iOS + Android | Skips Gradle/Xcode upload until slug is verified |
| EAS production secrets | `SENTRY_AUTH_TOKEN`; `SENTRY_PROJECT` (real slug, **not** `hermes-mobile`) | Source maps once slug is known |

## Verify installed APK org

```bash
adb pull "$(adb shell pm path com.iganapolsky.hermesmobile | head -1 | cut -d: -f2)" /tmp/hermes-phone.apk
strings /tmp/hermes-phone.apk | rg 'o4509329568235520|4509329571315712'
```

Expected: `o4509329568235520` and `4509329571315712`. No `o4510699334467584` (subway-w3).

## Source maps (follow-up)

`metro.config.js` with the Sentry Metro plugin is intentionally not added yet (T-77). Until `SENTRY_PROJECT` slug is set and EAS secrets include `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`, stack traces may show minified frames.
