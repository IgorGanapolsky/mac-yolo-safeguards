# Expo Updates best practices + Hermes Mobile versioning contract (July 2026)

## Verdict
For a July 2026 React Native / Expo app, treat `runtimeVersion: "fingerprint"` plus `cli.appVersionSource: "remote"` as the default for any production app that ships more than one native release per quarter. Pair it with a `production` channel pinned to a stable branch, a `staging` channel that always tracks `main`, and a single explicit rollback path (`eas update:roll-back-to-embedded` for catastrophic OTA failures, `eas update:republish --branch <stable>` for ordinary bad updates). Hermes Mobile is on a dual semver + CalVer scheme (`v0.x.y` / `vYYYY.M.D`) and has not cut a 1.0 yet, so the "1.1 cutover from 1.0" framing in the prompt is currently inaccurate - the most recent shipped release at the time of writing is v0.18.0 / v2026.7.1.

## Expo Updates

### Channels, branches, and the build-time pin
A channel is a name baked into the native binary at build time; a branch is an ordered list of OTA updates. Every channel can be linked to exactly one branch, but a branch can serve many channels. Production builds get a `production` channel linked to a `production` (or `release-*`) branch; internal builds get a `staging` channel linked to `main`. Use `eas channel:list / :view / :create` and `eas branch:list / :view` to inspect them, and `eas update --branch <name>` (or `eas update --auto` inside Git) to publish ([34]). Promote by reassigning the channel: point `production` at `main` after QA passes, then back at `production` if something regresses - no rebuild required because the channel is only a pointer.

### OTA vs native binary
EAS Update can ship any change that does not require a new native binary: JavaScript, TypeScript, styling, images, asset updates, even small layout/UI logic fixes. It cannot ship changes to native code, native dependencies, `app.json`/`Info.plist` permissions (camera, location, push), or the Expo SDK version - those require an EAS Build that produces a new store binary (EAS Update - Introduction). The native layer is what makes OTA delivery possible, so a "native runtime" bump is the trigger for a new build.

### Rollback vs roll-back-to-embedded
Two distinct operations, named confusingly:
- `eas update:republish --branch <branch>` or `eas update:rollback <groupId>` republishes a prior update so it becomes the tip of the branch again - the equivalent of `git revert` on a branch ([34]).
- `eas update:roll-back-to-embedded` tells the runtime to ignore the embedded bundle and re-fetch from the update server; it is the nuclear option for a corrupt embedded update or a totally broken published bundle ([34]).

### Critical / mandatory updates
A runtime policy of `appVersion` or `fingerprint` only affects which updates are compatible. To force users onto a specific update you still need a hard cut-over (gate the app behind a minimum-update check in JS) or ship a new native binary. Treat OTA as best-effort delivery - it is not a guaranteed push channel, especially on Android where background fetch can be deferred.

## Versioning

### runtimeVersion policies
Set `runtimeVersion` in `app.json`; four policies are supported (Runtime versions and updates):

| Policy | Bumps when | Trade-off |
|---|---|---|
| `nativeVersion` (legacy) | Native project version changes | Friction-heavy, not recommended |
| `sdkVersion` | SDK version changes | Misfires on non-SDK native deps |
| `appVersion` | `android.versionCode` / `ios.buildNumber` changes | Fewer rebuilds; if you forget to bump the version after a native change, you ship an incompatible update against the old runtime |
| `fingerprint` | Any change that affects the native layer (deps, plugins, SDK, native code) | Almost impossible to mismatch; rebuilds more often |

Default to `fingerprint` for any app that ships native dependencies outside Expo's managed workflow; fall back to `appVersion` only when you have strict CI guarantees that every native change is accompanied by a version bump.

### appVersionSource: remote vs local
`cli.appVersionSource` in `eas.json` chooses who owns `android.versionCode` and `ios.buildNumber` (App version management):

| Value | Source of truth | Behaviour |
|---|---|---|
| `remote` (default since EAS CLI 12.0.0) | EAS servers | Build server increments `versionCode` / `buildNumber` automatically; values in `app.json` are ignored |
| `local` | `app.json` in your repo | EAS reads values as-is and does not write back |

Use `remote` unless you have a downstream system (e.g., a CI pipeline that mints build numbers for App Store Connect API submission) that depends on `app.json` being the source.

### Branching discipline
Two-branch model that survives contact with reality:
- `main` - always shippable; auto-published to `staging` channel for internal TestFlight / Play Internal.
- `production` (or `release-1.4`, etc.) - protected, only fast-forwarded from `main` once QA signs off; pinned to the `production` channel.

If a fix is urgent, branch from the last known-good `production` tip, push the fix, and republish; the channel pointer moves without an app store round-trip.

## Hermes Mobile contract

Hermes Mobile (the open-source agent by Nous Research) does **not** use a SemVer-major (1.x) cutover yet. Releases are dual-tagged ([18], GitHub releases):

| Tag scheme | Example | Meaning |
|---|---|---|
| SemVer-style | `v0.18.0` | API/contract change - still pre-1.0 |
| CalVer (date) | `v2026.7.1` | Release date, monotonically increasing |

Key facts as of July 2026:
- Latest release: `v0.18.0 / v2026.7.1` on 1 July 2026; previous cut was `v0.17.0 / v2026.5.29.2` ([18]).
- No `v1.0` or `v1.1` release exists - the "1.1 cutover from live 1.0" framing in the prompt is incorrect.
- Cadence: roughly monthly SemVer bumps with a CalVer tag that always advances.
- Marketing positioning: lighter and more stable between releases than OpenClaw, easier setup, better default memory, plus a checkpoint/rollback system OpenClaw lacks ([22]).
- Migration story: the docs ship a `hermes claw migrate` command, framing Hermes as a successor rather than a parallel tool.

Implications for integrators:
- Pin to the CalVer tag (`v2026.7.1`) if you want predictable date-based rollback points; pin to the SemVer tag (`v0.18.0`) if you want the contract version.
- Because the SemVer tag is still `0.x`, expect the project to reserve the right to make breaking changes between minor bumps - treat each minor as potentially breaking until 1.0.
- Monotonic CalVer guarantees that any higher `v2026.M.D` supersedes a lower one for upgrade ordering, but it does not guarantee backwards compatibility.

## References

1. *Expo Documentation*. https://docs.expo.dev/
2. *App version management*. http://docs.expo.dev/build-reference/app-versions
3. *Configuration with eas.json*. http://docs.expo.dev/eas/json
4. *How EAS Update works*. http://docs.expo.dev/eas-update/how-it-works
5. *expo - NPM*. https://www.npmjs.com/package/expo
6. *Teardown — Force updates for React Native & Expo | Teardown*. http://teardown.dev/
7. *Troubleshoot build errors and crashes - Expo Documentation*. https://docs.expo.dev/build-reference/troubleshooting
8. *Expo SDK 54 - Expo Changelog*. http://expo.dev/changelog/sdk-54
9. *Manage branches and channels with EAS CLI*. https://docs.expo.dev/eas-update/eas-cli
10. [[docs] Need to create channel to make update work #29205](https://github.com/expo/expo/issues/29205)
11. *Expo EAS OTA Updates: A Safe Production Playbook*. https://www.72technologies.com/blog/expo-eas-ota-updates-without-bricking-production
12. *EAS Update OTA Strategy in 2026: Channels & Rollbacks*. https://www.72technologies.com/blog/eas-update-ota-strategy-channels-rollouts-rollbacks
13. *EAS Update*. https://docs.expo.dev/eas-update/introduction
14. *Using EAS Update*. https://docs.expo.dev/build/updates
15. *Runtime versions and updates - Expo Documentation*. https://docs.expo.dev/eas-update/runtime-versions
16. *Using Expo at Hipcamp*. http://expo.dev/customers/hipcamp
17. *Hermes Agent Mobile for iPhone - Free App Download*. https://www.appbrain.com/appstore/hermes-agent-mobile/ios-6767006319
18. *Hermes Agent Changelog — changelogs.info*. https://changelogs.info/hermes-agent/changelog
19. *Hermes Agent Mobile - App Store*. https://apps.apple.com/us/app/hermes-agent-mobile/id6767006319
20. [[SDK 54/55] Hermes crashes systematically on physical ...](https://github.com/expo/expo/issues/44356)
21. *NousResearch/hermes-agent v2026.3.28 on GitHub - NewReleases.io*. https://newreleases.io/project/github/NousResearch/hermes-agent/release/v2026.3.28
22. *OpenClaw vs Hermes 2026: 1,300 Reddit Comments Analyzed | Kilo*. https://kilo.ai/openclaw/vs-hermes
23. *modificationDate: June 03, 2026 title: EAS Update description: EAS Update is a cloud service that serves updates for projects using the expo-updates library.*. http://docs.expo.dev/eas-update/introduction
24. *Releases · NousResearch/hermes-agent - GitHub*. http://github.com/NousResearch/hermes-agent/releases
25. *Hermes Agent 2026 Release Tracker (Nous Research)*. http://petronellatech.com/blog/hermes-agent-ai-guide-2026
26. *Hermes Agent Hits #1 on OpenRouter, Beats OpenClaw*. https://theplanettools.ai/blog/hermes-agent-nous-research-number-one-openrouter-beats-openclaw-may-2026
27. *Hermes Agent Is Now #1 on OpenRouter. Here's What Every ...*. https://chatforest.com/builders-log/hermes-agent-nous-research-openrouter-number-one-self-improving-builder-guide
28. [Hermes Agent Updates by Nous Research - July 2026
    - Releasebot](http://releasebot.io/updates/nousresearch/hermes-agent)
29. *Changelog — Hermes Agent | Nous Research*. https://www.hermes-ai.net/changelog
30. *GitHub - NousResearch/hermes-agent: The agent that grows with you · GitHub*. http://github.com/NousResearch/hermes-agent
31. *hermes-agent/README.md at main · NousResearch ... - GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/README.md
32. *NousResearch/hermes-agent: The agent that grows with you - GitHub*. https://github.com/nousresearch/hermes-agent
33. *Hermes Agent — Open-Source AI Agent with Persistent Memory*. https://hermes-agent.org/
34. *modificationDate: June 16, 2024 title: Manage branches and channels with EAS CLI description: Learn how to link a branch to a channel and publish updates with EAS CLI.*. https://docs.expo.dev/eas-update/eas-cli/
