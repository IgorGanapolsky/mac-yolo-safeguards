# Zero-focus background automation — July 2026

Research run: `trun_d3be5e813aa94970867a3d887aac3b70`

## Decision

Hermes automation must not attach to the interactive macOS login session. The default execution order is:

1. provider API or first-party CLI;
2. headless process or isolated Linux container;
3. GitHub-hosted runner or dedicated Mac mini build account;
4. isolated remote browser only when a provider exposes no sufficient API.

Visible Chrome, Comet, Simulator.app, AppleScript activation, synthetic keyboard/mouse input, and reuse of a personal browser profile are prohibited for scheduled/background work. A workflow that cannot comply must fail closed; it must not silently fall back to the human desktop.

This is a zero-focus guarantee, not a zero-resource guarantee. Background work can still consume CPU, memory, disk, and network, so long-running local jobs must also use macOS QoS (`taskpolicy -c background` or `taskpolicy -b`) and bounded concurrency. The current local `taskpolicy(8)` manual confirms the `background`, `utility`, and `maintenance` QoS clamps.

## Current repo evidence

The new audit command is:

```sh
node tools/zero-focus-automation-audit.js audit --json
node tools/zero-focus-automation-audit.js enforce path/to/background-entrypoint
```

The 2026-07-22 repository scan covered 728 executable/source/config files and found 111 static matches across 34 files:

| Category | Matches |
| --- | ---: |
| Desktop activation | 68 |
| Personal/browser session coupling | 36 |
| Synthetic input | 7 |

These are migration inventory matches, not proof that 111 hijacking processes are running. The live process audit found no active `osascript`, `cliclick`, or Simulator.app controller after the one visible Simulator UI process was terminated. Chrome and Comet were intentionally left untouched.

Highest-risk concrete surfaces include:

- `hermes-mobile/scripts/run-e2e-proofs.sh`, `run-fresh-user-e2e.sh`, `run-simulator-e2e.sh`, and `run-hermes-mobile.sh`: `open -a Simulator`;
- `hermes-mobile/scripts/asc-chrome-*.js` and `chrome-social-post.js`: AppleScript control of Google Chrome, with some explicit `activate` calls;
- `scripts/skool_playwright_login.py`: `headless=False`;
- `tools/revenue-autonomous-loop.js`: optional Chrome AppleScript/activation;
- `scripts/verify-mac-text-hotkeys-e2e.sh` and `tools/tinker-yolo-computer.*`: synthetic input/foreground control.

The Android emulator already has a correct background-capable path in `hermes-mobile/scripts/dev-emulator.sh --headless`. Android's official emulator documentation states that `-no-window` disables the graphical window and `-no-audio` disables audio. See [Android Emulator command-line options](https://developer.android.com/studio/run/emulator-commandline).

## Workload routing

| Workload | Background-safe path | Do not use |
| --- | --- | --- |
| GitHub PRs, CI, releases | `gh` CLI, REST/GraphQL API, GitHub-hosted runner | Chrome/Comet tabs |
| React Native unit/type/lint tests | local CLI with QoS, Linux container, or hosted runner | IDE test UI |
| Android build and E2E | Linux CI/KVM; locally use emulator `-no-window -no-audio` | visible emulator window |
| iOS build/sign/submit | GitHub-hosted macOS runner, EAS Build/Submit, or dedicated Mac mini build account | local Simulator.app or Xcode UI |
| Web testing | pinned Playwright container, headless Chromium, isolated BrowserContext | personal Chrome/Comet profile or CDP attachment |
| Play Store | Google Play Developer API, `fastlane supply`, EAS Submit | Play Console browser automation |
| App Store Connect | App Store Connect API plus `fastlane deliver`/`pilot` or EAS Submit; dedicated remote macOS for binary tooling | AppleScript-driven Chrome |
| Gmail | Gmail API | Gmail browser tab automation |
| Stripe | Stripe API/CLI | Dashboard browser automation |
| Provider with no adequate API | isolated remote browser/container with a dedicated account/profile | host desktop computer-use |

Google documents the Play Developer API as the programmatic surface for publishing and app-management tasks. `fastlane supply` wraps that API for metadata, images, binaries, and tracks. Apple coverage is less uniform: use API/fastlane/EAS where supported, but keep policy, agreement, or console-only gaps on an isolated remote macOS surface rather than the human browser. References: [Google Play Developer API](https://developers.google.com/android-publisher), [fastlane supply](https://docs.fastlane.tools/actions/supply/), [fastlane deliver](https://docs.fastlane.tools/actions/deliver/), [EAS Build](https://docs.expo.dev/build/introduction/), and [EAS Submit](https://docs.expo.dev/deploy/submit-to-app-stores/).

## Isolation rules

### macOS

- Do not schedule GUI-capable work as the human user's LaunchAgent. Apple's launchd guide distinguishes per-user agents from system daemons; a LaunchAgent lives inside a login session and is therefore the wrong trust boundary for autonomous desktop-capable automation. See [Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).
- Prefer GitHub-hosted macOS runners for ephemeral jobs. When a persistent Mac mini is required, use a dedicated standard user, dedicated keychain, separate worktree, no logged-in Aqua session, and an ephemeral/JIT self-hosted runner where practical. See [GitHub self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners) and [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- `xcodebuild` compilation can be headless. Local simulator UI/E2E is not accepted as a zero-interference guarantee because Xcode tooling can still interact with the logged-in session. Run iOS UI tests on hosted macOS or the dedicated Mac mini account.
- The installed Xcode's `simctl boot` supports `--arch`, `--disabledJob`, `--enabledJob`, and `--checked-allocations`; it does **not** support the claimed `--no-launch` flag. Do not rely on that flag.
- `LSUIElement` and `LSBackgroundOnly` are application Info.plist keys, not launchd environment variables. They are not a security boundary and do not make arbitrary automation safe.
- Do not base the design on deprecated `sandbox-exec`. Use account, runner, container, and provider authorization boundaries.

### Browser automation

- Use a version-pinned Playwright image and matching Playwright package version. The official Docker guide recommends `--init`, `--ipc=host` for Chromium, and a non-root user plus seccomp profile for untrusted sites. See [Playwright Docker](https://playwright.dev/docs/docker).
- Create a fresh BrowserContext per test/run. Playwright documents that contexts isolate cookies, local storage, and session storage. See [Playwright isolation](https://playwright.dev/docs/browser-contexts).
- Authentication state is secret-bearing. Keep it outside git and outside personal browser directories; Playwright warns that storage-state files may contain impersonation-capable cookies and headers. See [Playwright authentication](https://playwright.dev/docs/auth).
- Never connect over CDP to a personal Chrome/Comet session and never mount `~/Library/Application Support/Google/Chrome` or a Comet profile.

### Containers

- Docker/Colima is appropriate for Linux build/test, headless Playwright, databases, and generic agent jobs.
- Docker on macOS is not a replacement for Xcode, iOS code signing, or iOS Simulator. Those remain macOS runner workloads.
- Pin images by version and digest where practical. Bound CPU, memory, PID count, and concurrency; use a non-root user, read-only filesystem, tmpfs for ephemeral state, and minimum network access.

## Fail-closed policy

`zero-focus-automation-audit.js` has two modes:

- `audit`: inventories legacy risks and exits zero;
- `enforce`: exits 2 if a target contains foreground-capable constructs.

The detector currently blocks these classes:

- `open -a` app launches;
- AppleScript execution or explicit activation;
- `cliclick`, Hammerspoon event injection, `CGEventPost`, and application focus helpers;
- headed Playwright/Puppeteer;
- CDP/debugger attachment;
- direct Google Chrome/Comet executable use;
- personal Google Chrome/Comet profile paths;
- computer-use drivers.

It intentionally does not rewrite or disable legacy scripts owned by active agents. The next safe integration is to place `enforce` in front of every scheduled entrypoint and add a required CI check for newly introduced matches.

## Migration plan

### First 24 hours

1. Keep every current task CLI/headless; no browser or Simulator UI control.
2. Use the audit in inventory mode to map LaunchAgent and scheduler targets to exact foreground-capable code paths.
3. Put `enforce` in front of new or newly migrated scheduled entrypoints.
4. Route GitHub, Gmail, Stripe, Play, and App Store work to their APIs/CLIs.
5. Run Android E2E with `-no-window`; send iOS UI/E2E to hosted macOS.

### Seven days

1. Migrate the `asc-chrome-*`, social-post, Gmail verification, and revenue browser scripts to provider APIs or an isolated headless runner.
2. Replace `open -a Simulator` scripts with CI jobs; retain local compile-only `xcodebuild` paths.
3. Create a pinned Playwright container with an ephemeral auth directory and no personal-profile mounts.
4. Add the no-foreground detector as a required check for scheduled/background changes.
5. Add resource budgets and queue/concurrency caps to local background jobs.

### Thirty days

1. Move persistent iOS signing/release work to a dedicated Mac mini build user or hosted macOS runners.
2. Make self-hosted runners ephemeral/JIT where possible and keep signing keys in a dedicated CI keychain.
3. Remove or quarantine all host-desktop computer-use paths from autonomous schedules.
4. Track per-job CPU, memory, duration, retries, focus-process violations, and API/browser fallback rate.
5. Require an explicit, time-bounded foreground lease for any remaining manual-only provider step; the default remains deny.

## Verification contract

A background automation change is accepted only when all of these are true:

- no `Simulator.app`, `osascript`, `cliclick`, synthetic-input, or host computer-use process was launched;
- no personal Chrome/Comet profile was opened, attached to, or mutated;
- Android emulator command includes `-no-window` when local;
- browser jobs run in an isolated headless context/container;
- iOS UI jobs have a hosted/dedicated-runner receipt;
- `zero-focus-automation-audit.js enforce <entrypoint>` exits 0;
- the user remains able to use the Mac throughout the run.

## Raw research caveat

The raw Parallel report is retained in `parallel-research/zero-focus-background-automation-july-2026.*` for provenance. This curated decision record supersedes several unverified raw suggestions, notably `simctl boot --no-launch`, using `LSUIElement` as a launchd environment variable, relying on `sandbox-exec`, and treating every App Store task as API-complete.
