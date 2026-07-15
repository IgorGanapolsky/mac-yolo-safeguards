
# EAS Update OTA Best Practices Mid-2026 for Production React Native Apps

## Executive Verdict

- **`runtimeVersion: { policy: "appVersion" }` is the conservative default.** "The `appVersion` policy will increment the runtime version whenever the app version is incremented," but "if you forget to bump the app version when changing the native runtime, then you'll have a runtime version mismatch" (`[5]`).
- **`fingerprint` is the high-safety upgrade.** It auto-bumps whenever "anything that may impact the native runtime changes," making "incompatible updates extremely unlikely, at the cost of making it necessary to create builds more often." Best fit for CNG-heavy apps; stay on `appVersion` if you want fewer binaries (`[5]`).
- **Marketing version and runtime version are two numbers.** `expo.version` (`CFBundleShortVersionString` / `versionName`) is product communication; the runtime version is "the OTA safety boundary." They only have to agree when the policy is `appVersion` (`[1]`).
- **Ship JS via OTA, native via the store binary.** OTA covers JS code, business logic, UI, styling, images, fonts, and feature flags. Store binaries cover new native deps, permissions, native SDKs, and store metadata (`[23]`).
- **Always publish staged and signed.** `eas update --rollout-percentage=10` then `eas update:edit`; sign with `--private-key-path` (`[6]`, `[15]`).
- **Run production + staging channels.** Channels (in `eas.json`) link to branches by default; route QA through `staging` before `eas channel:edit production --branch ...` for promotion (`[19]`).
- **Multi-runtime is normal.** Holdouts and fresh stores both receive updates because channels can be linked to branches one-by-one and per-platform `runtimeVersion` is supported (`[19]`).
- **Default to EAS Workflows for CI.** Use `type: build | update | submit` jobs chained by `needs`, gated by `if:` + reusable functions like `startsWith(...)` (`[27]`).

## The Three-Number Versioning Model

| Number | Lives in | Drives | OTA effect |
|--------|---------|--------|------------|
| Marketing `expo.version` | `app.json` / `app.config.js` | Store listing; under `appVersion` also drives runtimeVersion | Drives runtime when `policy: "appVersion"` |
| Build number `ios.buildNumber` / `android.versionCode` | `Info.plist` / `android/app/build.gradle`; EAS can `autoIncrement` from a remote source when `cli.appVersionSource: remote` | Store replacement eligibility | Not OTA |
| Runtime `expo.runtimeVersion` | `app.json` (or per-platform override) | Which builds receive which updates: "the runtime version of the build and the target runtime version of an update must match exactly" | OTA gate |

`autoIncrement` requirements: "does not support the version option" and "is not supported if you are using EAS Update and runtime policy set to `nativeVersion`" - so "use the `appVersion` policy instead" (`[13]`).

SemVer: `MAJOR.MINOR.PATCH` "communicates product evolution, not runtime compatibility." PATCH = fixes / OTA-only; MINOR = new visible capability; MAJOR = structural shift warranting a new runtime (`[1]`).

## Channels, Branches, Rollouts

Channels (in `eas.json`) attach to branches; "by default, a channel is linked to a branch of the same name." The full release-engineering surface is `eas channel:edit production --branch version-2.0` (`[19]`).

Two roll-out modes, both CLI-first:

- **Per-update.** Start with `eas update --rollout-percentage=10`. Progress or finish via `eas update:edit`. Kill via `eas update:revert-update-rollout`, which "will guide you through reverting back to the previous state" (`[6]`).
- **Branch-based.** `eas channel:rollout` walks through "selecting a channel, choosing a branch, and setting the percentage." End via either "Republish and revert" (rolls forward into the old branch) or "Revert" (disregards the new branch) (`[6]`).

Before production, use "development builds" or the "Persistent Staging Flow" - "a version of the production app pointing to a staging channel" - plus channel surfing for internal users (`[10]`).

## Code Signing and Key Rotation

End-to-end code signing is three steps. (1) `npx expo-updates codesigning:generate` writes `private-key.pem`, `public-key.pem`, `certificate.pem`. (2) `npx expo-updates codesigning:configure` adds `codeSigningCertificate` and `codeSigningMetadata` (`keyid`, `alg`) to `app.json` for CNG or to the platform manifests for non-CNG. (3) `eas update --private-key-path ./private-key.pem`; the EAS CLI "automatically detects that code signing is configured for your app." On-device, the update is "verified against the embedded certificate and included signature" (`[15]`).

Rotation: back up old keys, generate a new pair, possibly change `updates.codeSigningMetadata.keyid`, cut a new runtime version (so old builds trust the old cert), and publish with the new key. Treat rotation as part of a version bump, not routine (`[15]`).

## CI Publish Patterns

**EAS Workflows (preferred).** YAML DAG of `type: build | update | submit` jobs chained via `needs`, with `if:` plus reusable functions: `success()`, `failure()`, `startsWith(...)`, `endsWith(...)`, `contains(...)`. A two-file set covers most teams: a `preview` workflow on PRs (publish to `staging`) and a `deploy` workflow on merge to `main` (`build -> submit -> update`) (`[27]`, `[30]`).

**GitHub Actions / GitLab.** Add `EXPO_TOKEN` as a CI secret, run `eas update --branch production --message "<sha>" --non-interactive` after `eas init` has been run locally at least once to mint credentials (`[26]`, `[22]`).

## OTA vs Store Binary

| Change | Channel |
|--------|---------|
| JS code, UI, business logic, feature flag, asset, API URL | OTA |
| Native module, native dep, permission, Play/Info metadata | Store binary + version bump |
| Trying to push native via OTA | Blocked; runtimeVersion mismatch and `expo-updates` "may detect an error and attempt to roll back" |

Sources: `[23]`, `[5]`.

## Multi-Runtime After a 1.0 to 1.1 Bump

When 1.1 ships to stores, 1.0.x lives on for holdouts and 1.1.x lives on for fresh upgraders - both need OTA. Strategy:

- Keep `production` channel pinned to the `1.0` branch for one cycle, then `eas channel:edit production --branch 1.1`. Use `eas channel:rollout` against a `holdout/1.0` branch to peel users off.
- For iOS/Android divergence, switch to `app.config.js` and set `expo.ios.runtimeVersion` and `expo.android.runtimeVersion`; when both a top-level and a per-platform runtime are set, "the platform specific one takes precedence" (`[5]`, `[2]`).

## Action Checklist

You have a dual-store app already on `runtimeVersion: { policy: "appVersion" }`. Apply items in order.

1. Pin config. Confirm `app.json` `runtimeVersion: { policy: "appVersion" }`. Set `cli.appVersionSource: remote` and `production.autoIncrement: true` so the store build numbers tick up automatically (`[13]`).
2. Two channels. Declare `production` and `staging` in `eas.json` (`[19]`).
3. Split routing. PRs with `app.json` runtimeVersion unchanged and no native prebuild delta -> `eas update --branch staging` in PR preview; PRs touching `expo.plugins`, native deps, or `Info.plist` / `android/app/build.gradle` -> full `eas build` batch and a `expo.version` bump.
4. Sign every update. Commit `private-key.pem` to a secret manager; CI calls `eas update --private-key-path <key>` (`[15]`).
5. Default to staged rollouts. `eas update --branch production --rollout-percentage=10` for first production push; progress with `eas update:edit`; document `eas update:revert-update-rollout` as the kill-switch (`[6]`).
6. Wire CI in `.eas/workflows`. PR workflow -> publish to `staging`; merge to `main` workflow -> `build -> submit -> update` chained by `needs`, gated by `if: github.ref == 'refs/heads/main'` (`[27]`).
7. Cutover plan for 1.1. Hold `production` on `1.0` for one cycle, then `eas channel:edit production --branch 1.1`. If iOS/Android diverge, switch to `app.config.js` with per-platform runtime (`[2]`).
8. Monitor and kill. Watch crash-free sessions, JS error rates, and `expo-updates` rollback events for the first 24h; revert on regression (`[6]`).
9. Plan the future switch to `fingerprint`. "If the fingerprint changes, we build. If it doesn't, we ship OTA" - strongest OTA safety boundary; budget the extra binaries (`[1]`).

## Synthesis

| Dimension | `appVersion` | `fingerprint` |
|-----------|--------------|---------------|
| Mechanism | Runtime = hash of `expo.version` (+ per-platform overrides) | Runtime = hash of native graph (deps + config plugins + prebuild output) |
| Build cadence | Only when version bumps | Whenever native graph changes, even tiny |
| OTA safety boundary | Discipline-based (must bump version) | Automatic; every native-impacting change invalidates OTA by construction |
| Trade-off | Less binary churn; risk of "silent" OTA if human forgets | More binaries; near-zero risk of pushing JS to an incompatible build |
| Best for | Small teams / low native-dep churn | CNG-heavy apps / frequent native changes |

Three tensions recur. (1) Marketing vs runtime: under `appVersion` they share a number, but "SemVer communicates product evolution, not runtime compatibility" - so a PATCH bump for purely JS fixes does not require a new binary. (2) Per-platform divergence: the docs allow per-platform runtimeVersion, but community practice is to keep them aligned and only diverge at cutovers. (3) Signing vs speed: `eas update:revert-update-rollout` is faster than key rotation, so sign every update by default and treat rotation as a version-bumping event.

Bottom line: stay on `appVersion` until the native-dep graph goes hot; over time, switch to `fingerprint`. Always publish to `staging` first, sign every update, roll out in stages, and let EAS Workflows or an `EXPO_TOKEN`-authenticated CI orchestrate the DAG - the OTA safety boundary is only as strong as the team's ability to invoke it consistently.

## References

1. *How I Manage Versioning in Expo Apps - Welcome, Developer*. https://www.welcomedeveloper.com/posts/how-i-manage-expo-app-versioning
2. *How to set different app versions per platform in Expo and handle ...*. https://stackoverflow.com/questions/79756619/how-to-set-different-app-versions-per-platform-in-expo-and-handle-eas-update-run
3. *Expo EAS UpdateのOTA配信でハマった話 — Fingerprintの罠*. https://zenn.dev/mackey_55/articles/2c4ac7bb9ec326
4. [[docs] Need info on why setting a runtimeVersion policy of ... - GitHub](https://github.com/expo/expo/issues/43908)
5. *Runtime versions and updates - Expo Documentation*. https://docs.expo.dev/eas-update/runtime-versions
6. *Rollouts - Expo Documentation*. https://docs.expo.dev/eas-update/rollouts
7. *The production playbook for OTA updates - Expo*. https://expo.dev/blog/the-production-playbook-for-ota-updates
8. *How EAS Update works*. http://docs.expo.dev/eas-update/how-it-works
9. *Installing Expo Modules to Support Expo Updates on a ...*. https://medium.com/%40shanavascruise/installing-expo-modules-to-support-expo-updates-on-a-bare-react-native-project-20f6d76ca561
10. *Preview updates - Expo Documentation*. https://docs.expo.dev/eas-update/preview
11. *expo/docs/pages/eas-update/runtime-versions.mdx at main ...*. https://github.com/expo/expo/blob/main/docs/pages/eas-update/runtime-versions.mdx
12. *expo/docs/pages/build-reference/app-versions.mdx at main ...*. https://github.com/expo/expo/blob/main/docs/pages/build-reference/app-versions.mdx
13. *App version management - EAS Build*. https://docs.expo.dev/build-reference/app-versions
14. *Configuration with eas.json*. http://docs.expo.dev/eas/json
15. *End-to-end code signing with EAS Update - Expo Documentation*. https://docs.expo.dev/eas-update/code-signing
16. *Deploy updates - Expo Documentation*. https://docs.expo.dev/eas-update/deployment
17. *Expo Updates v1 - Expo Documentation*. https://docs.expo.dev/technical-specs/expo-updates-1
18. *EAS Update - Expo Documentation*. https://docs.expo.dev/eas-update/introduction
19. *modificationDate: February 18, 2025 title: How EAS Update works description: A conceptual overview of how EAS Update works.*. https://docs.expo.dev/eas-update/how-it-works
20. [[build-tools] Fix runtime version mismatch from premature fingerprint ...](https://ithub.global.ssl.fastly.net/expo/eas-cli/actions/runs/28058568778/usage)
21. *eas update - Error: Unable to determine runtime version for android*. https://github.com/expo/eas-cli/issues/1266
22. *Added --non-interactive and --force support when --id is not ...*. https://github.com/expo/eas-cli/pull/1983/files
23. *React Native OTA Updates: Complete Guide (2026)*. https://stalliontech.io/react-native-ota-updates-guide
24. *Expo (EAS) Run 1st build non-interactively - Stack Overflow*. https://stackoverflow.com/questions/78935837/expo-eas-run-1st-build-non-interactively
25. *EAS Build + Fastlane: Automate OTA Updates & App Store ...*. https://javascript.plainenglish.io/eas-build-fastlane-combo-fully-automated-ota-app-store-google-play-delivery-a2beffa2e083
26. *Trigger builds from CI - Expo Documentation*. https://docs.expo.dev/build/building-on-ci
27. *Syntax for EAS Workflows - Expo Documentation*. https://docs.expo.dev/eas/workflows/syntax
28. *EAS CI/CD with GitHub Actions*. https://www.expodeveloper.com/blog/eas-cicd-with-github-actions
29. *EAS 工作流程的语法*. https://expo.nodejs.cn/eas/workflows/syntax
30. *EAS Workflows examples - Expo Documentation*. https://docs.expo.dev/eas/workflows/examples/introduction
31. *CI/CD EAS Workflows: From Pull Request to Production*. https://www.welcomedeveloper.com/posts/cicd-eas-workflows
