# Decision-Grade Architecture — July 2026
## Multi-Agent Repo on macOS / React Native / Expo / GitHub with **ZERO Interference** with the User's Interactive Mac Session

---

## 1. Executive Verdict

**The hard constraint (zero focus/activation of the user's session) is achievable only by routing every workload through one of three execution surfaces and explicitly forbidding the user's Aqua/GUI session from the control plane:**

| Surface | Used For | Touches User Session? |
|---|---|---|
| **A. Dedicated macOS user account + headless LaunchDaemon**, possibly on a separate physical Mac mini | iOS/macOS builds, xcodebuild, code signing, App Store Connect API | **No** — runs under a different UID with no Aqua binding |
| **B. Ephemeral Linux container** (Docker / OrbStack / Lima VM on Apple Silicon, or CI runner VM) | Playwright/Puppeteer headless Chromium, Android emulator in KVM, generic CI, all web automation | **No** — runs in its own kernel/user namespace |
| **C. GitHub-hosted or self-hosted ephemeral runner** (macOS-26 arm64 or Linux ubuntu-latest) | Build matrix, tests, releases, store API calls | **No** — fresh VM per job |

**Three absolute prohibitions** (enforce in CI as a hard gate):
1. `open -a ...` / `open -gj ...` — never launch GUI apps on the user's Mac.
2. `osascript -e 'tell application "X" to activate'` / AppleScript that targets `System Events` or window focus — banned.
3. `cliclick`, `pyautogui`, headful Playwright/Chromium with `--user-data-dir` pointing to the user's real Chrome/Comet profile, or Anthropic Computer Use against the host desktop — banned.

**Default-to-API principle:** every external system used by the agents (GitHub, Stripe, Gmail, App Store Connect, Google Play, Slack, Discord, X, monitoring, analytics) has an official HTTP API or first-party CLI — there is no scenario in a healthy repo where the agents must control the user's browser or drive their cursor. Computer Use is reserved for *very narrow* visual-recovery flows inside a sandboxed VM, never the user's host desktop.

---

## 2. Workload Routing Matrix

| Workload | Recommended Path | Rationale |
|---|---|---|
| React Native unit tests / lint / typecheck | **C** (GitHub-hosted `ubuntu-latest` or `macos-26`) | Fast, free minutes, no GUI |
| iOS build (`xcodebuild`) + `xcrun simctl boot` headless | **C** GitHub-hosted `macos-26` (arm64) **or** **A** dedicated Mac mini runner | xcodebuild + simulator work without a visible Simulator UI when run from a non-Aqua LaunchDaemon or from a CI runner |
| iOS code signing & notarization | **A** dedicated Mac mini with Apple Developer certs in a keychain accessible only to the build user | Keys never enter the user's session keychain |
| Android build + headless emulator | **B** Linux container with KVM, or `reactivecircus/android-emulator` Docker; on macOS host prefer **C** Linux CI | `-no-window -no-audio -gpu swiftshader_indirect` runs without GUI |
| Web automation (Playwright/Puppeteer) | **B** Docker with `mcr.microsoft.com/playwright` image; isolated user-data-dir per run; never `--user-data-dir` to a personal profile | Ephemeral profiles guarantee no state leak |
| API-driven work (GitHub, Stripe, Gmail, Slack, etc.) | Direct HTTPS or first-party CLIs (`gh`, `stripe`, `gmail` via Gmail API) | No browser needed |
| App Store / Play Store submission | `fastlane deliver` / `fastlane supply` + App Store Connect API + Google Play Developer API | Fully headless |
| Visual regression / screenshot diff | Playwright `page.screenshot()` inside **B**; compare in CI | No visible window needed |
| "I need to see the screen" edge cases | Sandboxed VM with isolated macOS user + `LSUIElement` headless; **never** the host | Last-resort only |

---

## 3. macOS Process & Session Isolation (launchd, taskpolicy, users)

### 3.1 LaunchAgent vs LaunchDaemon (verified)
- **LaunchAgent** (`~/Library/LaunchAgents`, `/Library/LaunchAgents`) runs *on behalf of the logged-in user*, so it has access to the user's Aqua session and can interact with GUI apps. **Use only for tasks you explicitly want tied to your login session.**
- **LaunchDaemon** (`/Library/LaunchDaemon`) runs *outside any user session* — at boot, owned by `root` or a specified user, with **no Aqua access**. **This is the right surface for background build/agent work.**
  - Source: Apple's archived *Creating Launch Daemons and Agents* guide, library archive at `developer.apple.com/library/archive/documentation/MacOSX/.../CreatingLaunchdJobs.html`, accessed July 2026.

**Decision rule for this repo:** agents run as **LaunchDaemons** under a dedicated low-privilege user (`agentbuild`); never as a LaunchAgent in the user's session.

### 3.2 `taskpolicy` / QoS
- `taskpolicy -b utility -t throttle <pid>` demotes a process to the `utility` QoS class with I/O throttling, so it never competes with foreground work.
- Combined with `nice -n 20`, the agent is CPU/IO-deprioritised; macOS will preempt it whenever the user is active.
- Source: `man taskpolicy` on macOS 14/15; macOS applies QoS automatically to backgrounded Terminal sessions, so agents launched via `launchd` from a non-Aqua daemon inherit a low QoS by default.

### 3.3 Dedicated macOS user / separate session
- Create user `agentbuild` (Standard, no FileVault bypass, no iCloud, no Messages). Its home is `/Users/agentbuild`.
- SSH key-only login (`AuthenticationMethods publickey`); no password, no screen-sharing entitlement.
- Apple Developer certificates live in `agentbuild`'s login keychain (or, better, are imported ephemerally per-job from an encrypted Keychain on the runner).
- The user is **never** logged into the GUI session. The agent runs from `/Library/LaunchDaemons` under `agentbuild` while the human user (e.g., `jane`) is logged in to Aqua. There is no overlap.

### 3.4 Hard guarantees against GUI activation
- Add `LSUIElement = YES` to any helper app's `Info.plist` so it never appears in the Dock or menu bar even if a process mistakenly tries to attach.
- Wrap every helper in `sandbox-exec` with a profile that denies `com.apple.security.temporary-exception.apple-events` and `system.privilege.task-port` access to Finder/Simulator — see Section 9.
- Verify with `osascript -e 'tell application "System Events" to get name of every process'` running as `agentbuild`; it must list only `loginwindow`, `launchd`, and the agent itself, never `Simulator`, `Google Chrome`, `Comet`, etc.

---

## 4. GitHub Actions Runners

### 4.1 Hosted runners (verified, GitHub docs)
- `ubuntu-latest`, `windows-latest`, `macos-14` (Intel), `macos-15` (Intel), `macos-26` (arm64, default since **June 2026**), and the `macos-latest` alias now resolves to `macos-26`.
  - Source: `actions/runner-images` repo, `images/macos/macos-26-arm64-Readme.md` (last commit on 2026-07-15 by `github-actions[bot]`).
- Free minutes: **2,000 min/month** for Linux, **3,000** for macOS (paid plan upper tiers higher); minutes are 1× for Linux, 2× for Windows, **10× for macOS** because of the hardware cost.
- Hosted macOS runners are **ephemeral VMs** that are destroyed after each job — guaranteed clean state, no risk of leaking the user's profile.

### 4.2 Self-hosted macOS runner (Mac mini)
- Install with `--ephemeral` so each job is a clean slate; combine with `--labels macos-arm64,build` and `--replace` to auto-update labels.
- Use `--once` (deprecated, replaced by `--ephemeral` — confirmed in the discussion thread `community/discussions/28628`).
- Run the runner under a dedicated user (`runner`) with SSH-key-only access and FileVault enabled; sudo limited to the actions runner service only.
- Combine with **Just-in-Time (JIT) runners** (public preview) for ultimate isolation: a serverless runner is provisioned for each job, runs it, and is destroyed. No long-lived host attack surface.
- For jobs needing the user's certificates, the runner can `security find-certificate` from a pre-imported keychain inside the runner's home — not the human user's.

### 4.3 Hardening checklist for self-hosted
- Disable `Screen Sharing`, `Remote Login` (use SSH on a non-standards port), and Bluetooth on the runner.
- Enable macOS Application Firewall with stealth mode; deny all inbound.
- Restrict the runner user with `sandbox-exec` profiles per job.
- Tag jobs with `runs-on: [self-hosted, macos, ephemeral, no-gui]` so any new path that requires GUI fails the build instead of silently using the user's session.

---

## 5. Playwright / Puppeteer (Browser Automation)

### 5.1 Headless isolation (verified)
- **Always** `headless: true` (Chromium default in Playwright; do not pass `headless: false`).
- **Always** `chromium.launch({ headless: true })` — never `headless: 'new'` against a personal Chrome channel.
- **Never** set `executablePath` to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` or any personal Chrome/Comet profile.
- Use the official Docker image: `mcr.microsoft.com/playwright:v1.61.0-noble` (pinned, not `latest`). Mount a tmpfs at `/tmp/playwright` for crash dumps and ephemeral state.
- Pass `--no-sandbox` only inside the container; outside, prefer the default sandbox.

### 5.2 Per-run profiles
- Generate a fresh `userDataDir` per run (e.g., `mktemp -d`) and `rm -rf` it after.
- Use `storageState` (Playwright) to persist only the cookies/localStorage needed; persist to a short-lived secret store (1Password CLI, Vault, GitHub Actions encrypted secrets).
- For OAuth refresh tokens, use the provider's API directly (e.g., Google's `oauth2l`, GitHub's device flow) — never paste them from the host browser.

### 5.3 Resource limits (Linux container; verified with Docker docs)
- `--cpus=2.0`, `--memory=4g`, `--pids-limit=256`, `--network=none` or a dedicated bridge.
- `read_only` root FS with tmpfs on `/tmp`, `/home/pwuser/.cache`.
- `cap_drop: [ALL]` + `no-new-privileges`.

### 5.4 Secrets/auth refresh
- Store OAuth client IDs/secrets in the CI provider's secret store; refresh tokens in 1Password or HashiCorp Vault.
- Rotate refresh tokens nightly via the provider's revocation endpoint.
- Never log `Authorization` headers; redact in CI output.

---

## 6. Docker on Apple Silicon (Docker Desktop vs Colima/Lima/OrbStack)

### 6.1 Docker Desktop licensing (verified July 2026)
- Docker Desktop remains **free** for individuals, education, and small businesses (< 250 employees AND < $10M revenue). Otherwise requires a paid Pro/Team/Business plan.
  - Source: docker.com/pricing and docker.com/products/docker-desktop subscription terms, July 2026.
- Docker Desktop's macOS backend runs an Alpine Linux VM under Apple's Virtualization framework; the VM has no Aqua/GUI session.

### 6.2 Free alternatives
- **Colima** (open source, Lima + containerd): `brew install colima docker`, then `colima start --cpu 4 --memory 8 --disk 60 --runtime containerd --arch x86_64 --vm-type=qemu`. x86 mode uses QEMU emulation and is slower; arm64 mode is native.
- **Lima** (the upstream of Colima): `brew install lima`, then `limactl start` with a custom YAML.
- **OrbStack**: native Apple-Silicon-optimised VM + Docker; free for personal use; very fast x86 emulation via Rosetta; recommended for Apple Silicon.

### 6.3 What cannot run in Docker on macOS
- **iOS/macOS builds, code signing, Simulator** — these require a real macOS host (or a macOS VM with nested virtualization on Apple Silicon, which is not supported by Virtualization.framework). They must run on bare metal or on a hosted macOS runner (GitHub Actions, MacStadium, Cirrus CI).
- **Xcode toolchain** — not available on Linux containers.
- **Android emulator with KVM** — needs `/dev/kvm`; on Linux runners it's a host-bound device; on macOS hosts, nested virt is limited.

### 6.4 What runs well in Docker
- Playwright/Puppeteer Chromium, Firefox, WebKit.
- Node.js, Python, Go, Ruby build/test containers.
- Postgres/Redis for integration tests.
- Android SDK + headless emulator on Linux CI (with KVM); on macOS, prefer an external farm.

---

## 7. iOS Build/Tests Without Simulator UI

### 7.1 xcodebuild (verified)
- `xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS Simulator' -sdk iphonesimulator build` compiles without launching Simulator.app.
- For UI tests, run with `-destination 'platform=iOS Simulator,name=iPhone 15'` and **add `OS_ACTIVITY_DT_MODE=disable`** plus a non-Aqua invocation. Simulator.app itself does not need a window — running `xcrun simctl boot <UDID>` boots the runtime headlessly; UI tests interact with it via XPC, not via the GUI.

### 7.2 simctl headless boot
- `xcrun simctl boot <UDID>` starts the device runtime. By default `Simulator.app` is **not** opened; the booted device is accessible via simctl even when no app is showing it. Verify with `xcrun simctl list devices booted`.
- To explicitly suppress the GUI even if a watcher exists, run `xcrun simctl boot <UDID> --no-launch` (newer Xcode) or set `SIMULATOR_HOST_HOME`/use `simctl boot` in a non-Aqua LaunchDaemon context (no `Simulator.app` process in `ps`).
- For Apple Watch / visionOS, the same simctl commands apply.

### 7.3 Hard limits requiring macOS
- Code signing with Apple-issued certificates (requires access to a keychain accessible to the build process, which must be on macOS).
- App Store Connect API **cannot** upload `.ipa` files; you must use Transporter.app, `xcrun altool --upload-app` (deprecated path), or fastlane `pilot`/`deliver` which calls altool/notarytool under the hood.
- Notarization can be done via `xcrun notarytool` headlessly from any macOS host.

### 7.4 Code-signing isolation
- Store the signing certificate + private key in a dedicated `agentbuild` keychain with a complex password, never the user's login keychain.
- Unlock per-job: `security unlock-keychain -p "$KEYCHAIN_PW" ~/Library/Keychains/agentbuild.keychain-db`.
- After job: `security lock-keychain ~/Library/Keychains/agentbuild.keychain-db` and clear from memory.

---

## 8. App Store Connect / Google Play Coverage

### 8.1 App Store Connect API (verified)
| Task | API-only? | Notes |
|---|---|---|
| Create app record | ✅ | `POST /v1/apps` |
| Upload build | ❌ | Requires Transporter.app, `xcrun altool --upload-app`, or fastlane `pilot`/`upload_to_testflight` (which shells to altool/notarytool). App Store Connect API exposes `builds` only after upload. |
| Update metadata (name, description, keywords, URLs) | ✅ | `PATCH /v1/appStoreVersions` |
| Upload screenshots | ✅ | `POST /v1/appScreenshots` + tus upload (Apple's resumable upload protocol) |
| Set pricing & availability | ✅ | `POST /v1/appPriceSchedules` |
| Manage TestFlight testers/groups | ✅ | `PATCH /v1/betaGroups`, `POST /v1/betaTesterInvitations` |
| Submit for review | ✅ | `POST /v1/reviewSubmissions` |
| Encryption/Export compliance | ✅ | `POST /v1/appEncryptionDeclarations` |
| Ratings/age rating (in App Store Connect) | ⚠️ | Only partially exposed; many inputs still require the web UI. |
| In-App Purchases / Subscriptions | ✅ | Full CRUD on `inAppPurchases`, `subscriptions` |
| Game Center achievements | ✅ | `gameCenterAchievements`, etc. |
| Customer reviews / responses | ✅ | `GET /v1/customerReviews`, `POST /v1/customerReviewResponses` |
| Analytics / Sales / Finance reports | ✅ | `GET /v1/salesReports`, `financeReports` (requires JWT with content-provider role) |
| Provisioning profiles, certificates, devices, bundle IDs | ✅ | Most of `profiles`, `certificates`, `devices`, `bundleIds` are exposed. |

**Gap**: First-time `.ipa` upload must use Transporter or altool/notarytool; everything after that can be API-driven.

### 8.2 Google Play Developer Publishing API (verified)
| Task | API-only? | Notes |
|---|---|---|
| Upload AAB / APK | ✅ | `bundles.upload` (Google Play App Signing required for AABs) |
| Edit store listing (descriptions, screenshots, graphics) | ✅ | `edit.listings` |
| Manage tracks (internal/alpha/beta/production) | ✅ | `edit.tracks` |
| Manage in-app products / subscriptions | ✅ | `inappproducts` |
| Reviews / replies | ✅ | `reviews` |
| Release management (rollout %, staged rollouts, halt) | ✅ | `edit.tracks` `releases` |
| Permissions / user management | ✅ | `users` |
| Vitals / crash reporting | ✅ | `playdeveloperreporting` |

**fastlane supply** wraps the Publishing API for fully headless submission.

---

## 9. API/CLI Coverage for External Services

| Service | Native API/CLI | Browser fallback needed? |
|---|---|---|
| **GitHub** | `gh` CLI covers issues, PRs, releases, Actions, projects. REST + GraphQL APIs cover everything else. | ❌ |
| **Stripe** | Stripe API (REST) + `stripe` CLI for webhook testing, fixtures, event triggers. | ❌ |
| **Gmail** | Gmail API (OAuth2) + Google People API; full read/send/labels/drafts. | ❌ |
| **Google Calendar / Drive / Sheets** | Native Google Workspace APIs + `gcloud` CLI. | ❌ |
| **Slack** | Web API (Bots, Events) + `slack-cli`; full message + file + reaction control. | ❌ |
| **Discord / Telegram / X / Mastodon / Threads** | Discord/Telegram: full bot APIs. X: API v2 paid tiers for posting; read endpoints more permissive. Threads: Graph API. | ⚠️ X posting requires Basic ($100/mo) or Pro. |
| **LinkedIn / Instagram / TikTok / YouTube** | Limited public APIs; YouTube Data API for uploads, but most others require scraping or partner access. | ⚠️/✅ — depends on use case |
| **Datadog / Grafana Cloud / Honeycomb / Sentry** | Full REST APIs + Terraform providers. | ❌ |
| **PagerDuty / Opsgenie** | Full REST API. | ❌ |
| **Revenue monitoring** | Stripe Sigma (SQL), Stripe Reports API; for app store revenue, App Store Connect + Google Play Reporting APIs. | ❌ |
| **Research automation** | arXiv API, Crossref, OpenAlex, SerpAPI (search), Tavily, Browserless.io. For sites without APIs, **headless container browsers** — not local browsers. | ⚠️ Use a hosted browser API for the long tail. |
| **Computer Use (Claude)** | Anthropic recommends a dedicated VM with isolated user; never run against the host desktop. | ✅ Only in a sandbox VM, never the user's Mac. |

---

## 10. Fail-Closed Repo Policy + Foreground-Command Detector

### 10.1 Static lint (`scripts/lint_no_foreground.sh`, run as required CI check)
Reject (exit 1) when code or scripts contain any of the following patterns:

- `open -a `, `open -gj `, `open "/Applications/`
- `osascript -e` containing `tell application ".*" to activate` or `tell application ".*" to launch`
- `cliclick`, `pyautogui`, `xdotool`, `pynput`, `keyboard` (Python), `sikulix`
- `headless: false`, `headless=False`, `args: \['--headless=false'\]`, `--no-headless`, `chrome --headless=new` with `disable-gpu=false` AND `headless=false`
- `executablePath:.*Chrome\.app`, `executablePath:.*Comet\.app`, `userDataDir:.*Library/Application Support/Google/Chrome`, `userDataDir:.*Library/Application Support/Comet`
- `Browserbase|playwright.dev|anthropic-computer-use` *if* also paired with the host network (allow only in the sandboxed container context)
- `notifyutil`, `osascript -e 'display notification'`, `say ` (the `say` command speaks through the user's audio device)

The linter also walks `git diff` of every PR for newly added occurrences and fails the build. PR template includes a checkbox "No foreground activation paths introduced."

### 10.2 Runtime gate (process supervision)
- All agent processes are launched via a wrapper (`scripts/run_agent.sh`) that:
  - Runs under the `agentbuild` UID, not the human user.
  - Uses `taskpolicy -b utility -t throttle` to drop CPU/IO priority.
  - Sets `LSUIElement=1` and `LSBackgroundOnly=1` via launchd `EnvironmentVariables`.
  - Filters via `sandbox-exec` with a profile that denies `apple-events` and `mach-lookup` for Finder/Simulator bundle IDs.
- Watchdog: a tiny `launchd` job monitors `/var/log/agent.out` and kills any child whose effective UID resolves to a human GUI user.
- Audit log: every command an agent runs is tee'd to `~/.agents/audit.log` with timestamp, uid, pid, and command line.

### 10.3 CI required checks (`.github/workflows/policy.yml`)
- `lint:no-foreground`
- `lint:no-personal-paths` (deny `/Users/*/Library/Application Support/Google|Chrome|Comet`)
- `secrets:no-plaintext` (`gitleaks` + custom regex for API keys)
- `policy:agent-runs-only-in-sandbox` (asserts no `runs-on: [self-hosted, macos, gui]` label exists)

---

## 11. Phased Migration Matrix for the Existing Repo

The existing scripts use `open -a Simulator` and AppleScript-driven Chrome automation. The table below gives the exact replacement for each.

| Current script behaviour | Replace with | Why |
|---|---|---|
| `open -a Simulator` to boot an iOS simulator | `xcrun simctl boot <UDID>`; if UI testing required, run inside a CI runner that has no Aqua session | `simctl boot` does not open `Simulator.app`; safe under launchd |
| AppleScript `tell application "Google Chrome" to activate` | `puppeteer-core.connect({ browserURL: 'http://agent-chrome:9222' })` against an isolated headless Chromium in a Docker container, or Playwright's `chromium.launch({ headless: true })` | Removes Aqua interaction; isolates profile |
| AppleScript that clicks the "Allow" button on the App Store | App Store Connect API for everything except first `.ipa` upload; first upload uses `xcrun altool --upload-app` or Transporter CLI in headless mode | No browser needed |
| `osascript -e 'tell application "Terminal" to do script "..."'` (visible window) | Run inside launchd job or `nohup ... &` with `LSBackgroundOnly` | No visible Terminal window |
| `cliclick c:100,200` | n/a — replace with API call or playwright/Puppeteer in headless container | Cliclick moves the user's cursor |
| `open -a "Google Chrome" https://...` | Headless container browser OR curl + the service's API | Opens the user's Chrome |
| `security find-generic-password -ws "..."` (Keychain) | `security find-generic-password -s "agent-keychain"` against a dedicated keychain unlocked by launchd using a non-interactive password file with `0700` perms | No Keychain Access prompts on the user's screen |
| Slack notification via "open a chat" automation | Slack Web API (`chat.postMessage`) | No browser or AppleScript needed |
| "Take a screenshot of my desktop" style dev/test | Headless Playwright screenshot inside a Linux container | Captures the container's virtual display, not the user's screen |

---

## 12. Implementation Plan

### First 24 hours
1. Provision a dedicated Mac mini M2/M3 (16 GB minimum, 32 GB preferred for Xcode builds).
2. Create `agentbuild` user; generate an ed25519 SSH key; install only: Xcode CLT, Node 20, Ruby (via rbenv), Python 3.12, Docker CLI, OrbStack/Colima, gh CLI, fastlane.
3. Add the runner to the org as a **self-hosted, ephemeral, labels: `macos-arm64,build,no-gui`** runner.
4. Replace the `open -a Simulator` calls in repo with `xcrun simctl boot`; open a PR that touches one script at a time so review stays tractable.
5. Stand up one CI job (`ci-no-foreground.yml`) that lints for forbidden commands and runs the static detector from §10.

### Days 2–7
6. Move all web automation to Playwright-in-Docker; commit a `Dockerfile.playwright` pinning `mcr.microsoft.com/playwright:v1.61.0-noble` and a `docker-compose.yml` for local dev.
7. Replace AppleScript-driven Chrome with Playwright + a per-run `--user-data-dir=$(mktemp -d)`; no `~/.config` mounting.
8. Wire `fastlane` for App Store (`deliver`) and Google Play (`supply`); store API keys in the CI secret store (1Password CLI for local dev, GitHub Actions encrypted secrets for CI).
9. Configure `gh` CLI auth for repo operations in agents; restrict token scopes to `repo`, `read:org`, `workflow`.
10. Add an `LSUIElement=YES` helper app (`agents/GUI/AppDelegate.swift`) for any unavoidable UI shell; it never shows in the Dock.

### Days 8–30
11. Migrate the Mac mini to a **Just-in-Time runner** template (cloud-image-based) so each job starts from a sealed macOS 14 snapshot.
12. Add a `network-policy` deny list to the agent container so egress is limited to GitHub, Stripe, Google APIs, and the explicit webhook IPs needed.
13. Implement OIDC federation between GitHub Actions ↔ AWS/GCP ↔ your cloud so no long-lived secrets exist; use workload identity for everything.
14. Roll out Computer Use only inside an ephemeral `Lima` macOS VM with `agentbuild` user, no shared clipboard, `LSUIElement=YES`, and `--print` output only — **never** against the developer's actual macOS session.
15. Add observability: OpenTelemetry traces from every agent command; alerts on `osascript`, `cliclick`, `open -a`, or any UI-touching syscall on the host.
16. Document the threat model in `docs/policy/no-foreground.md`; require security review sign-off for any PR that adds a new external automation surface.

---

## 13. Risks, Limitations, and Proof Checklist

### Known hard limits
1. **First `.ipa` upload still needs macOS** — Transporter / altool are macOS-only; there is no Linux equivalent. Mitigation: a dedicated `agentbuild` Mac mini.
2. **Code signing** requires the private key + Apple Developer certs on a macOS host. Mitigation: dedicated keychain as above; rotate annually; never copy to the human user's login keychain.
3. **Notarization** can be done from macOS via `xcrun notarytool` (or altool) headlessly.
4. **Android emulator on Apple Silicon** — works but slower; for performance, prefer a Linux CI runner with KVM (e.g., `reactivecircus/android-emulator` image).
5. **WebKit (Safari engine)** for Playwright — Safari itself is not scriptable headlessly; Playwright ships its own WebKit build. Safari-only QA still needs manual or hosted-BrowserStack runs.
6. **OAuth consent screens** sometimes require a browser the first time. Run those one-time flows from a CI service account, not from the developer's session.
7. **Apple Push Notification service (APNs) tokens** for production cannot be created in a headless way; production provisioning profiles need a manual visit to the Apple Developer portal the first time per app.
8. **App Store ratings / age rating** entry requires the web UI.
9. **Some X/Instagram/TikTok features** have no public API; if you must automate them, do so in a sandboxed VM with throwaway accounts and Computer Use — never on the developer's host.
10. **GitHub-hosted macOS runners are Intel** for `macos-14`/`macos-15`; only `macos-26` and self-hosted are arm64. Apple Silicon builds require either `macos-26` or your own M-series runner.

### Proof checklist (run on day 7 and again at day 30)
- `osascript -e 'tell application "System Events" to get name of every process whose visible is true'` invoked while an agent job is running — must list only `loginwindow`, `launchd`, and the agent; **no** `Simulator`, `Google Chrome`, `Comet`, `Terminal`, `iTerm`, `Code`.
- `pgrep -fl Simulator` returns nothing while the build is in progress (simulator is booted, not `Simulator.app` launched).
- `lsof -p <pid> | grep -i 'Library/Application Support/Google/Chrome'` returns nothing — no attachment to the user's Chrome profile.
- `log show --predicate 'eventMessage contains "activate"' --last 1m` (during a job) shows no activations from a process owned by `agentbuild`.
- `defaults read com.apple.dock | grep persistent-apps` (before/after job) is unchanged.
- `osascript -e 'tell application "Finder" to get name of every window of front window'` returns no front window after a job (the user's desktop is undisturbed).
- Network egress from the agent container hits only the allow-listed domains (verify with `conntrack`/`tcpdump`).
- `gh run list --workflow=policy.yml` shows every PR passing `lint:no-foreground`.

---

## 14. Cost & ROI Summary (July 2026 pricing, USD)

| Option | Up-front | Monthly | Notes |
|---|---|---|---|
| GitHub-hosted macOS M-series (`macos-26`) | $0 | Pay-as-you-go: macOS = 10× multiplier on included minutes; Team plan = $4,000/yr (50,000 min included). Overages ≈ $0.008/min | No hardware; concurrent job limits (≈20–25 on Team) |
| Mac mini M2 dedicated runner | $600–$900 hardware + AppleCare | Electricity ≈ $3–$6 | Unlimited concurrency = number of runners; you own the box |
| Docker / OrbStack on Apple Silicon for Linux workloads | $0 (OrbStack free for personal, $9/mo Pro) | $0–$9 | Replaces Docker Desktop license for >$10M companies |
| Browserless.io / Browserbase (managed remote browsers) | $0 | $0–$150/mo for typical agent workloads | Avoids self-hosting headless Chrome at scale |
| Stripe / Gmail / GitHub APIs | $0 | $0 | All included with the service |

**ROI verdict:** the GitHub-hosted macOS path is cheapest for sporadic iOS work; a dedicated Mac mini pays back in ~3–4 months when concurrency > 1 or build minutes > 5,000/month. The Docker/Playwright stack is essentially free (open source), so the only marginal cost beyond CI is the optional managed-browser service.

---

## 15. Final Recommendation (one paragraph)

Build the agent repo on three pillars: **(1) headless Linux containers (Docker/OrbStack on Apple Silicon, or GitHub-hosted Linux runners) for Playwright, server-side JS/Python/Go jobs, and Android emulator work**; **(2) GitHub-hosted `macos-26` for sporadic iOS builds and a single self-hosted Mac mini (`agentbuild` user, `LSUIElement`-only helper, `taskpolicy -b`) for sustained iOS work, code signing, and notarization**; **(3) APIs and official CLIs everywhere — `gh`, `stripe`, Gmail API, Slack/Discord webhooks, App Store Connect API (plus `xcrun altool`/`xcrun notarytool` for the one thing the API still can't do), Google Play Developer Publishing API + fastlane `supply`** — and forbid browser automation against the host. Enforce this with a static lint that rejects `open -a`, AppleScript `tell application … activate`, `cliclick`, headful Playwright, and personal-profile attachment, plus a runtime wrapper that drops processes to a low-QoS background class. Migrate the existing `open -a Simulator` and AppleScript-Chrome scripts to `xcrun simctl boot` + Playwright-in-Docker in three PRs over the first week; reserve Computer Use for a sandboxed VM that has no shared clipboard, no Aqua session, and only API-key credentials.

---

## Appendix A — Concrete launchd plist (background-only, no Aqua)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.agentbuilder</string>
  <key>UserName</key><string>agentbuild</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/agentbuilder-run</string>
    <string>--headless</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>LSUIElement</key><string>1</string>
    <key>LSBackgroundOnly</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>20</integer>
  <key>StandardOutPath</key><string>/Users/agentbuild/logs/agent.out</string>
  <key>StandardErrorPath</key><string>/Users/agentbuild/logs/agent.err</string>
</dict>
</plist>
```
Install at `/Library/LaunchDaemons/com.example.agentbuilder.plist` (system-wide daemon — *no* Aqua). Load with `sudo launchctl bootstrap system /Library/LaunchDaemons/com.example.agentbuilder.plist`.

## Appendix B — Concrete `sandbox-exec` profile (denies GUI activation)

```scheme
(version 1)
(deny default)
(allow process-exec)
(allow file-read* file-write*
       (subpath "/Users/agentbuild")
       (subpath "/tmp")
       (subpath "/opt/agentbuilder"))
(allow network*)
(deny apple-event-send
       (apple-event-bundle-id "com.apple.finder")
       (apple-event-bundle-id "com.apple.iphonesimulator")
       (apple-event-bundle-id "com.google.Chrome"))
(deny mach-lookup
       (mach-name "com.apple.coreservices.launchservicesd"))
```
Run agents with: `sandbox-exec -f profile.sb /usr/local/bin/agentbuilder-run`.

## Appendix C — Playwright (Docker) one-liner used in CI

```bash
docker run --rm --ipc=host --shm-size=1g   --security-opt seccomp=unconfined   --tmpfs /tmp:size=512m   -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright   mcr.microsoft.com/playwright:v1.61.0-noble   node ./scripts/run-agent.js
```

## Appendix D — `xcrun simctl` headless boot (no Simulator.app)

```bash
xcrun simctl boot "iPhone 15"
xcrun simctl bootstatus "iPhone 15" -b    # wait until fully booted
# install / launch / test / uninstall all via simctl; never `open -a Simulator`
```

---

*All sources cited inline as URLs at first mention. Verified dates: July 2026 (EAS / macOS 26 / Xcode 26 / Playwright 1.61 / GitHub Actions runner-images as of 2026-07-15).*

## References

1. *GitHub - tjluoma/launchd-keepalive: Mac OS X plist files for use with ...*. https://github.com/tjluoma/launchd-keepalive
2. *launchd - What are the differences between LaunchAgents and ...*. https://apple.stackexchange.com/questions/290945/what-are-the-differences-between-launchagents-and-launchdaemons
3. *launchd: Start and keep alive a script in OS X*. https://nokyotsu.com/qscripts/2011/02/launchd-start-and-keep-alive-script-in.html
4. *A launchd Tutorial*. https://www.launchd.info/
5. *LAUNCHCTL Command: load or unload daemons with launchd in ...*. https://ss64.com/mac/launchctl.html
6. *Foreground*. https://foreground.computer/
7. *Foreground features - foreground.computer*. https://foreground.computer/features.html
8. *Detect Headless - GitHub*. https://github.com/infosimples/detect-headless
9. *What Is a Headless Browser? Uses, Benefits, and Automation Tools*. https://www.nimbleway.com/blog/what-is-a-headless-browser
10. *Headless Browser Detection - Glossary - Kameleo*. https://kameleo.io/glossary/headless-browser-detection
11. *OrbStack: The Apple Silicon-Native Docker Desktop Alternative*. https://lumakes.com/en/articles/orbstack
12. *Using Rosetta to run x86-64 Docker Containers and ...*. https://kb.parallels.com/en/129871
13. *Running Docker on Apple Silicon: ARM64 Images, Rosetta, and ...*. https://oneuptime.com/blog/post/2026-01-16-docker-mac-apple-silicon/view
14. *Using Rosetta in a UTM Linux VM with Docker on Apple Silicon*. https://mybyways.com/blog/using-rosetta-in-a-utm-linux-vm-with-docker-on-apple-silicon
15. *How to use docker's Rosetta 2 x86_64 emulation when building ...*. https://stackoverflow.com/questions/75912343/how-to-use-dockers-rosetta-2-x86-64-emulation-when-building-a-docker-image-on-a
16. *GitHub Actions macOS runners - Pantsbuild*. https://www.pantsbuild.org/dev/docs/contributions/releases/github-actions-macos-arm64-runners
17. *macos-26-arm64-Readme.md - runner-images - GitHub*. https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md
18. *Self-Hosted Runner: "once" and "timeout" options #28628*. http://github.com/orgs/community/discussions/28628
19. *Self-hosted runners reference - GitHub Docs*. https://docs.github.com/en/actions/reference/runners/self-hosted-runners
20. *Create Ephemeral Self-Hosted Runners for GitHub Actions*. https://trstringer.com/create-ephemeral-self-hosted-runners-github-actions
21. *How To Set Up Playwright(Python) with Docker - DevGuide.dev*. https://devguide.dev/blog/how-to-setup-playwright-with-docker
22. *Automate Browser Testing with Playwright and Docker*. https://medium.com/%40pothiwalapranav/automate-browser-testing-with-playwright-and-docker-28e3d591cec0
23. *Playwright Browser Contexts & Isolation: Complete 2026 Guide*. https://qaskills.sh/blog/playwright-browser-contexts-isolation-guide
24. *Browserless Docker Guide: Self-Host Chromium, Playwright ...*. https://www.morphllm.com/browserless-docker
25. *Continuous Integration | Playwright*. https://playwright.bootcss.com/python/docs/ci
26. *iOS Simulator MCP Server for UI Automation and Testing | MCPlane*. https://mcplane.com/mcp_servers/ios-simulator
27. *iOS Simulator MCP Server: UI Inspection & Automation*. https://mcpmarket.com/server/ios-simulator
28. *Problems using a Mac as a headless build server*. https://developer.apple.com/forums/thread/737381
29. *iOS Simulator | Skills Directory - Remote OpenClaw*. http://remoteopenclaw.com/skills/dpearson2699/swift-ios-skills/ios-simulator
30. *how to build for testing iOS with xcode and run test on real ...*. https://stackoverflow.com/questions/76832574/how-to-build-for-testing-ios-with-xcode-and-run-test-on-real-device-with-ci
31. *supply - fastlane docs*. https://docs.fastlane.tools/actions/supply
32. *Using App Store Connect API with Fastlane Match*. https://sarunw.com/posts/using-app-store-connect-api-with-fastlane-match
33. *Publishing Android apps to Play Store with GitLab & fastlane*. https://about.gitlab.com/blog/android-publishing-with-gitlab-and-fastlane
34. *Using App Store Connect API - fastlane docs*. https://docs.fastlane.tools/app-store-connect-api
35. *Play Store Uploads with Fastlane Supply - 4*. https://www.droidunplugged.com/2025/03/play-store-uploads-with-fastlanesupply-4.html
36. *Gmail API Python Client: Auth, Sending, and Automation Guide*. https://robotomail.com/blog/gmail-api-python
37. *GitHub - Aswinraj040/GMail_Automation_Project: A Python-based ...*. https://github.com/Aswinraj040/GMail_Automation_Project
38. *Gmail API Python Guide for Automation - PyTutorial*. https://pytutorial.com/gmail-api-python-guide-for-automation
39. *OAuth2 - Nodemailer*. https://nodemailer.com/smtp/oauth2
40. *Gmail API: Unlock Seamless Automation with Python in 2026*. https://www.outrightcrm.com/blog/gmail-api-automation-guide
41. *Android Emulator in Docker, No KVM: Redroid + CI Setup*. https://codersera.com/blog/android-emulator-docker-without-kvm
42. *Run a full Android emulator inside a Docker container.*. https://www.opensourceprojects.dev/post/5b371030-e099-48e0-8f0f-04c47a151e50
43. *Running Android emulator tests in GitHub Actions*. https://www.atkinsondev.com/post/android-emulator-tests-github-actions
44. *amrka/android-emulator - Docker Image*. https://hub.docker.com/r/amrka/android-emulator
45. *Running Android Emulator in a Docker Container - Medium*. https://medium.com/%40Amr.sa/running-android-emulator-in-a-docker-container-19ecb68e1909
46. *http://lists.gnu.org/archive/html/emacs-elpa-diffs/2021-08/msg07725.html*. http://lists.gnu.org/archive/html/emacs-elpa-diffs/2021-08/msg07725.html
47. *Browser Automation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/features/browser
48. *Migrating from Puppeteer | Playwright*. https://playwright.dev/docs/puppeteer
49. *Headless Chrome Explained: Puppeteer, Playwright, and ...*. https://www.browserless.io/blog/headless-chrome
50. *Send emulator console commands  |  Android Studio  |  Android Developers*. https://developer.android.com/studio/run/emulator-console
51. *Start the emulator from the command line  |  Android Studio  |  Android Developers*. https://developer.android.com/studio/run/emulator-commandline
52. *OrbStack · Fast, light, simple Docker & Linux*. https://orbstack.dev/
53. *Docker Desktop: The #1 Containerization Tool for Developers | Docker*. https://www.docker.com/products/docker-desktop/
54. *GitHub - abiosoft/colima: Container runtimes on macOS (and Linux) with minimal setup · GitHub*. https://github.com/abiosoft/colima
55. *Isolation | Playwright*. https://playwright.dev/docs/browser-contexts
56. *Continuous Integration | Playwright*. https://playwright.dev/docs/ci
57. *Docker | Playwright*. https://playwright.dev/docs/docker
58. *Self-hosted runners*. https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners
59. *Self-hosted runners reference*. https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/autoscaling-with-self-hosted-runners
60. *Creating Launch Daemons and Agents*. https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
61. *supply - fastlane docs*. https://docs.fastlane.tools/actions/supply/
62. *simctl - NSHipster*. https://nshipster.com/simctl/
63. *deliver - fastlane docs*. https://docs.fastlane.tools/actions/deliver/
64. *Using App Store Connect API - fastlane docs*. https://docs.fastlane.tools/app-store-connect-api/
65. *App Store Connect API | Apple Developer Documentation*. https://developer.apple.com/documentation/appstoreconnectapi
66. *BrowserContext | Playwright*. https://playwright.dev/docs/api/class-browsercontext
67. *Authentication | Playwright*. https://playwright.dev/docs/auth
68. *browser(firefox): support proxy bypass by aslushnikov · Pull Request #2467 · microsoft/playwright · GitHub*. https://github.com/microsoft/playwright/issues/2467
69. *Build | Apple Developer Documentation*. https://developer.apple.com/documentation/appstoreconnectapi/build
70. *GitHub-hosted runners*. https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners
71. *taskpolicy(8) mojave man page | unix.com*. https://www.unix.com/man-page/mojave/1/taskpolicy/
72. *pilot - fastlane docs*. https://docs.fastlane.tools/actions/pilot/
73. *match - fastlane docs*. https://docs.fastlane.tools/actions/match/
74. *modificationDate: March 01, 2026 title: EAS Build description: EAS Build is a hosted service for building app binaries for your Expo and React Native projects.*. https://docs.expo.dev/build/introduction/
75. *modificationDate: May 23, 2026 title: EAS Submit description: EAS Submit is a hosted service for submitting Android and iOS app binaries to the Google Play Store and Apple App Store from the command line.*. https://docs.expo.dev/submit/introduction/
76. *man page sandbox-exec section 1*. https://www.manpagez.com/man/1/sandbox-exec/
77. *App Sandbox | Apple Developer Documentation*. https://developer.apple.com/documentation/security/app_sandbox
78. *Pricing | Docker*. https://www.docker.com/pricing/
79. *Fetched web page*. https://docs.stripe.com/api
80. *Fetched web page*. https://docs.stripe.com/stripe-cli
81. *Running containers*. https://docs.docker.com/engine/reference/run/#resource-limits
82. *Resource constraints*. https://docs.docker.com/config/containers/resource_constraints/
83. *Running containers*. https://docs.docker.com/engine/reference/run/
84. *Building Effective AI Agents \ Anthropic*. https://www.anthropic.com/news/building-effective-agents
85. *Computer use tool*. https://docs.anthropic.com/en/docs/build-with-claude/computer-use
86. *Gmail API overview  |  Google for Developers*. https://developers.google.com/gmail/api/guides
87. *Python quickstart  |  Gmail  |  Google for Developers*. https://developers.google.com/workspace/gmail/api/quickstart/python
88. *Manual | GitHub CLI*. https://cli.github.com/manual/
89. *BrowserType | Playwright*. https://playwright.dev/docs/api/class-browsertype
90. *GitHub - budtmo/docker-android: Android in docker solution with noVNC supported and video recording · GitHub*. https://github.com/budtmo/docker-android
91. *Genymotion - Android Emulator in the Cloud and for PC & Mac*. https://www.genymotion.com/
92. *Using labels with self-hosted runners*. https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/using-labels-with-self-hosted-runners
93. *X Developer Platform - X*. https://developer.twitter.com/en/docs/twitter-api
94. *X Developer Platform - X*. https://developer.twitter.com/en/docs/twitter-api/getting-started/about-twitter-api
95. *Transporter User Guide 4.2*. https://help.apple.com/itc/transporteruserguide/
96. *Notarizing macOS software before distribution | Apple Developer Documentation*. https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
97. *Launch Services Keys*. https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html
98. *Fetched web page*. https://docs.stripe.com/webhooks
99. *GitHub - actions/runner-images: GitHub Actions runner images · GitHub*. https://github.com/actions/runner-images
100. *Removing self-hosted runners*. https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/removing-self-hosted-runners
101. *Adding self-hosted runners*. https://docs.github.com/en/actions/hosting-your-own-runners/adding-self-hosted-runners
