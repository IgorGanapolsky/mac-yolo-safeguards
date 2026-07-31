# Hermes Mobile Reliability Architecture: Decision-Grade Defenses for React Native 0.83, Expo SDK 55, and Tailscale Pairing (July 2026)

## Executive Summary

- **OTA Patch Efficiency (Hermes bsdiff)**: Expo SDK 55's opt-in `enableBsdiffPatchSupport` delivers approximately 75% smaller Hermes/JavaScript downloads on iOS and Android, materially reducing update failure windows on cellular networks [1]. -> Ship bsdiff on every release; gate `useHermesV1` off because it "significantly increases native build times" and is not yet recommended for Android in monorepos [1].
- **New Architecture Mandatory**: SDK 55 dropped Legacy Architecture support and removed `newArchEnabled`, so any Fabric/TurboModule bug is now a blocking release risk [1]. -> Promote Fabric-only smoke tests on physical iOS and Android before any release; assume Legacy escape hatches are gone.
- **Tailscale DERP is a Fallback, Not a Guarantee**: DERP servers only relay when direct connections fail; they are dual-stack IPv4/IPv6 and selected by latency, but custom relays "are not helpful for network-level debugging" [14]. -> Treat every DERP-routed session as a degraded path: lower image attachment ceilings, longer timeouts, and visible "relay" status copy.
- **MagicDNS Only Resolves Tailnet Hostnames**: MagicDNS auto-registers FQDNs and search domains but shared devices require Tailscale v1.4+ and full domain names; macOS `host`/`nslookup` bypass system DNS [13]. -> Always pass the FQDN to the mobile client; never rely on short names from native resolvers.
- **Sentry Defaults to Privacy-Safe Defaults**: Sentry's JS SDK does not send cookies, user identity fields, or user IP addresses by default; built-in denylist scrubs `auth`, `token`, `password`, `secret` in headers and query strings; `sendDefaultPii` is deprecated [31]. -> Do not flip `sendDefaultPii: true`; configure explicit `dataCollection` allow-deny lists for HTTP headers and query strings.
- **PostHog Inputs Masked by Default; Passwords Always**: PostHog's session replay masks input elements by default and always masks passwords regardless of configuration; `PostHogMaskView` wraps sensitive RN content explicitly [63]. -> Wrap pairing-code entry and any prompt-text echo with `<PostHogMaskView>` before enabling session replay.
- **Apple Privacy Manifest is Required, Not Optional**: Apps and third-party SDKs on Apple platforms must declare required-reason APIs via `PrivacyInfo.xcprivacy` using the `NSPrivacyAccessedAPITypes` key [43]. -> Add the manifest to every Hermes target and every SDK that touches UserDefaults, file timestamps, or system boot time.
- **Idempotency-Key IETF Behavior**: The draft specifies UUID generation, HTTP 409 on concurrent retries, HTTP 422 when a key is reused with a different payload, and HTTP 400 when the header is missing [61]. -> Stamp every prompt POST with a UUID-v7 `Idempotency-Key`; surface 409/422 to users with truthful "duplicate" copy instead of silently retrying.
- **App Store Search vs Publication Are Separate**: Text relevance from title, subtitle, keywords, and primary category drives ranking; keywords are capped at 100 characters and must not repeat words from the title; promotional text does not influence ranking [30]. -> Maintain distinct ASO metadata with full keyword coverage; do not let publication-pending status delay discovery iteration.
- **Google Play Supports Up to 50 Custom Store Listings**: Listings can target search keywords, country, or user/buyer state; Gemini can deploy tailored listings to discovered search queries [62]. -> Reserve at least one custom listing for "Hermes AI agent" and "control Mac from iPhone" keyword clusters before launch.
- **EAS Update Rollback is Branch-Local**: `eas update:rollback` rolls back per-branch to either a previously-published update or the update embedded in the build; it is interactive [67]. -> Drive rollbacks from CI with `--non-interactive` flags and a per-environment branch map.
- **GitHub Actions Concurrency Uses cancel-in-progress**: Concurrency groups with `cancel-in-progress: true` cancel queued runs; cannot be combined with `queue: max`; path filtering can leave required checks "Pending" Concurrency. -> Always set branch-scoped concurrency and gate required checks on full PR workflows, not path-filtered ones.

## 1. Threat and Failure Model

Hermes Mobile faces four overlapping threat surfaces: (a) the app-to-Mac transport under Tailscale and cellular conditions, (b) the iOS/Android app store review pipeline, (c) the local-only nature of paired agents that creates UX ambiguity, and (d) the CI/CD loop that must catch all of the above before they reach production. The model below classifies each observed failure class by the layer that can mechanically prevent it versus the layer that requires truthful UX disclosure.

| Failure Class | Layer | Preventable? | Honest Disclosure Required |
|---|---|---|---|
| Play/App Store discoverability vs publication | Store submission pipeline | No - publication is asynchronous; ranking is opaque | Yes - status copy must say "In Review" vs "Live" |
| Tailscale DERP/MagicDNS/cellular reachability | Network stack | Partially - DERP is a fallback, not a guarantee | Yes - "relay" indicator; never claim "private" |
| Pairing authorization | Tailscale ACL + UX | Yes - pre-auth keys + manual approval | Yes - show paired/unpaired state explicitly |
| Computer discovery (Bonjour/mDNS) | expo-network + iOS Local Network permission | Partially - iOS prompt is required | Yes - tell user why permission is needed |
| Approve/deny UX | Native module + Mac daemon | Yes - two-tap with timeout | Yes - "Pending on Mac" must be truthful |
| Duplicate prompt submission | Client + Server | Yes - UUID `Idempotency-Key` + server dedupe | Yes - "duplicate" copy for 409/422 |
| Stalled/empty replies | Stream lifecycle | Partially - heartbeats required | Yes - "Thinking..." must time out |
| Idempotent resend | Transport layer | Yes - retry with same key | N/A - silent retry is acceptable |
| Multimodal attachment retry/persistence | Object storage + client cache | Partially - retries | Yes - "Re-attach" affordance after failure |
| Shared-state Maestro contamination | Test runner | Yes - `clearKeychain` + `clearState` per launch | N/A |
| Physical-device vs emulator proof | CI matrix | Yes - run on real devices for release gating | N/A |
| CI flake prevention | Workflow design | Yes - concurrency + isolation + retries | N/A |
| Privacy-safe telemetry | SDK + Collector | Yes - allow-list + redaction | Yes - "telemetry" opt-in copy |
| Release/OTA/store proof boundaries | EAS + GitHub | Yes - phased rollout with rollback | Yes - "what's new" copy |

### What Can Be Mechanically Prevented

Pairing correctness, idempotent retries, keychain isolation in tests, OTA rollback, PII scrubbing defaults, and required CI checks all reduce to deterministic logic that is testable in unit, integration, and E2E layers. Expo SDK 55's mandatory New Architecture means Fabric/TurboModules are a single, addressable layer rather than a dual-codebase risk [1].

### What Cannot Be Honestly Guaranteed

- **App Store ranking**: Apple states explicitly that ranking is text-relevance and user-behavior driven and rejects keyword stuffing, so discoverability cannot be mechanically guaranteed [30].
- **iOS Local Network permission**: users can deny the Bonjour permission, breaking computer discovery silently [1]; production builds inherit the same constraint.
- **Pairing UX correctness**: humans can mis-tap; only truthful status copy and timeouts are reliable.
- **Cellular reachability of home Mac**: when the Mac is behind carrier-grade NAT, DERP relay is a fallback that cannot guarantee low latency [14].

## 2. Prioritized Gap Matrix

| Priority | Gap | Risk if Untouched | Effort | Owner |
|---|---|---|---|---|
| P0 | No `Idempotency-Key` on prompt POST | Duplicate echoes after retry; user confusion | Low | Mobile |
| P0 | Maestro tests share Keychain | iOS state leakage across suites; CI flakes | Low | Mobile/QA |
| P0 | Missing `PrivacyInfo.xcprivacy` | App Store rejection 5.1.1 / ITMS code | Low | iOS Lead |
| P1 | Tailscale pre-auth not issued on Mac first | Device approval friction | Medium | Mac daemon |
| P1 | DERP fallback not surfaced in UI | Users believe connection is "private" | Low | UX |
| P1 | Gemini-created listings unused | Missed ASO during launch | Medium | Growth |
| P2 | `useHermesV1` opt-in | Build time blow-up; not yet recommended on Android monorepo | Defer | iOS Lead |
| P2 | Sentry `sendDefaultPii` left at default | PII leakage | Low | Platform |
| P2 | EAS branch channels not pinned to GitHub refs | OTA rollback race | Medium | DevOps |
| P3 | PostHog session replay on by default | Pairing codes captured | Low | Platform |
| P3 | Concurrency groups unset | CI queue starvation on retest | Low | DevOps |

**Takeaways**: The first three P0s are non-negotiable and ship-blockers; the P1 set is what converts the app from "it works on my Mac" to "it works reliably on cellular." The P2/P3 lines represent steady-state hardening rather than launch gating.

## 3. Deterministic Unit, Integration, E2E, and Contract Tests

Hermes needs four layers of test, each with explicit, measurable gates:

- **Unit (Jest/RNTL)**: Pairing code parsing, idempotency-key generation (UUID v7 monotonicity), retry budget math, attachment URL signing, redact-on-export. Gate: 100% line coverage for `services/pairing`, `services/transport`, `services/attachments`.
- **Integration (MSW + Node)**: Mock the Mac daemon's HTTP endpoints; assert 409 on concurrent Idempotency-Key reuse and 422 on payload mismatch per [61]. Gate: every endpoint must reject missing header with 400 and reuse with diff payload with 422.
- **E2E (Maestro)**: Each flow launches the app with `clearKeychain: true` (iOS) and `clearState: true` (Android) inside `launchApp` so per-test isolation is guaranteed [51]. Cover: search discoverability deep-link, Bonjour prompt, pairing entry, approve on Mac, prompt send, duplicate-send resilience, attachment retry, OTA update apply.
- **Contract (Pact or schema)**: Lock JSON schemas for `/v1/prompt`, `/v1/attachment`, `/v1/pair`. Gate: any breaking change requires explicit version bump and migration plan.

Determinism rule: no test may rely on wall-clock `wait` beyond Maestro's built-in tolerance - prefer `assertVisible`/`assertNotVisible` with retry semantics.

## 4. CI Workflow and Required-Check Design

The pipeline must distinguish "fast" from "slow" jobs and gate `main` with the right checks.

- **PR Required Checks**: `lint`, `typecheck`, `unit`, `contract`, `maestro-smoke`, `eas-build-profile` (no actual build, just config validation), `play-store-metadata-validate`, `app-store-metadata-validate`, `privacy-manifest-present`. Branch protection should require these About protected branches.
- **Concurrency**: each workflow uses `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` so PR pushes cancel stale runs but `main` runs through to completion Concurrency.
- **Anti-Pending-Check Trap**: Avoid `paths-ignore` on any workflow whose job name appears in branch protection, because skipped workflows leave the check "Pending" forever Troubleshooting required status checks.
- **EAS Build Trigger**: Use `--non-interactive --json --wait` flags so CI gets a parseable status payload that can be reported back to the PR [32].
- **Gate Promotion**: `production` channel promotion requires `maestro-e2e-full`, `physical-device-ios`, `physical-device-android`, `play-integrity-attestation` and `app-attest-attestation` to all pass; missing any one blocks promotion.

## 5. Telemetry Events and SLOs Without User-Content Leakage

| Event | Attributes (allow-list) | PII Risk | SLO |
|---|---|---|---|
| `app.launch` | `release_id`, `channel`, `os`, `arch` | None | <2s cold start p95 |
| `pair.initiated` | `mac_tailnet_hash`, `duration_ms` | Hash only | success rate >99% within 30s |
| `pair.approved` / `pair.denied` | `pair_id_hash`, `outcome` | Hash only | median latency to decision <10s |
| `prompt.sent` | `idempotency_key_prefix`, `byte_size_bucket`, `attachment_kind` | No payload | success p95 <500ms LAN, <2s relay |
| `prompt.duplicate` | `idempotency_key_prefix`, `http_status` | None | rate <0.5% of sends |
| `prompt.timeout` | `wait_ms`, `transport` | None | <0.2% of streams |
| `attach.upload` | `kind`, `size_bucket`, `retry_count` | No raw bytes | success >99.5% over 3 retries |
| `ota.applied` | `update_id`, `policy` | None | rate >98% within 24h |
| `error.exception` | `fingerprint`, `stack_frames_hash` | Stack trace only | crash-free sessions >99.5% |

Privacy safeguards: Sentry data collection defaults omit cookies, user identity fields, and IP unless explicitly opted-in [31]. For OpenTelemetry spans the collector's redaction processor is configured in fail-closed mode: `allowed_keys` lists only event attributes; everything else is dropped unless `allow_all_keys` is true [84]. PostHog session replay masks input elements by default, masks passwords always, and requires `<PostHogMaskView>` around any prompt-text surface [63].

**Takeaway**: Telemetry is structurally restricted to allow-listed keys with hashing for join IDs; the Mac daemon mirrors this contract so telemetry flows never contain prompt bodies or attachment contents.

## 6. Fresh-User and Degraded-Network Device Matrix

| Network State | iOS Device | Android Device | Discovery Behavior | Pairing Behavior |
|---|---|---|---|---|
| Same Wi-Fi, fresh install | iPhone 15/16 | Pixel 7/8/Samsung S23 | Bonjour prompt then discovery | Pairing code + Bonjour verification |
| Same Wi-Fi, denied Bonjour | iPhone | n/a | Manual host/port entry only | Pairing code via manual entry |
| Cellular only (Mac behind CGNAT) | iPhone | Pixel | DERP relay; no LAN path | Pairing via Tailscale Funnel HTTPS endpoint |
| Cellular only (Mac public) | iPhone | Pixel | LAN unreachable; cloud relay required | Cloud relay with token |
| Offline (no network) | iPhone | Pixel | Queue locally; show "offline" copy | Pairing aborted with retry |
| VPN split-tunnel | iPhone | Pixel | LAN blocked; falls to DERP | DERP-only pairing |
| Captive portal | iPhone | Pixel | Discovery blocked | Pairing aborted; prompt to authenticate |
| Airplane + Wi-Fi | iPhone | Pixel | LAN only | Pairing may succeed |

Cellular reachability is not guaranteed; DERP fallback exists but is not a substitute for LAN [14]. MagicDNS relies on tailnet-side resolution and v1.4+ for shared devices [13]. Tailscale Funnel can expose the Mac to the broader internet over TLS, terminating at the local device, but is in beta [89].

**Takeaway**: Network matrix must cover seven real conditions; offline and captive-portal failures need a clear "offline" affordance rather than silent retries.

## 7. Rollout and Rollback Gates

EAS Update rollback is branch-local; the `eas update:rollback` CLI is interactive and supports rolling back to a previous update or the embedded build [67]. Hermes must therefore automate it from CI with non-interactive flags and a pre-defined per-environment branch map.

| Gate | Metric | Threshold | Action on Breach |
|---|---|---|---|
| Pair success rate | 5-min window | <99% | Halt rollout; auto-rollback |
| Duplicate prompt rate | 5-min window | >0.5% | Halt; flag client regression |
| Crash-free sessions | rolling 1h | <99.5% | Halt; rollback to embedded |
| OTA apply success | 24h | <98% | Investigate; bsdiff regression check |
| LAN discovery success | per session | <90% | Pause; verify MagicDNS resolver |

Runtime version policy must be `fingerprint` so the runtime version auto-increments on native changes; `expo-updates` may auto-rollback to the previously working update on mismatch [65].

**Takeaway**: Rollback is mechanical once the channel-to-branch map is fixed; SLO breaches trigger automated rollback rather than waiting for human review.

## 8. Anti-Flake State Isolation

Shared state is the dominant cause of Maestro flakes. The `clearKeychain` command clears all iOS Keychain data and can be passed directly inside `launchApp` to clear state on every test start, preventing tokens and login credentials from leaking between tests [51]. For Android, equivalent `clearState: true` inside `launchApp` clears app data. Hooks can automate Keychain clearing across all tests for shared cleanup.

Beyond keychain clearing:

- **Use `runFlow` for shared subflows** to avoid copy-paste drift between flows [48].
- **Apply `when` conditions** rather than waiting on real time [47].
- **Per-test ephemeral identifiers**: each test uses a unique test-runner UUID so pairing code, idempotency key, and attachment namespace never collide across suites.
- **Concurrency discipline**: cancel-in-progress for PR runs only; production builds always run to completion so flaky pass-through cannot leak Concurrency.

**Takeaway**: Anti-flake is mostly a discipline problem solved at flow authoring time, not at infrastructure time.

## 9. Concrete 30/60/90-Day Implementation Plan

| Horizon | Track A (Reliability) | Track B (Compliance) | Track C (Telemetry) |
|---|---|---|---|
| Days 0-30 | Ship `Idempotency-Key` UUID v7 on all prompt POSTs; integrate Tailscale pre-auth key flow; add 409/422 to client error matrix | Add `PrivacyInfo.xcprivacy` with required-reason API declarations; add `NSPrivacyAccessedAPITypes` to bundled SDKs; complete Play Data Safety section | Disable Sentry `sendDefaultPii`; configure `dataCollection` allow-deny lists; gate PostHog session replay behind opt-in |
| Days 31-60 | Wire Maestro `clearKeychain: true`/`clearState: true` per flow; add physical-device CI runners for iOS/Android; switch runtime policy to `fingerprint`; ship Hermes bsdiff OTA | Submit first EAS Build via CI with `--non-interactive --json`; configure required checks; wire Play Integrity and App Attest attestations | Configure OTel Redaction Processor in fail-closed mode with allow-listed keys; ship first SLO dashboards |
| Days 61-90 | Automated rollback pipeline via `eas update:rollback` per-branch; cell-degraded network matrix in QA; gemini-generated Google Play custom listings live | Finalize Apple Privacy labels and Data Safety section; ASO iteration for App Store keywords (100-char cap) [30] | Telemetry SLOs tied to release gates; pair/duplicate/timeout alerts wired |

**Takeaway**: Each track converges on day 90 with mechanical prevention for the top P0s and truthful disclosure for the irreducible cases (App Store ranking, iOS Local Network permission).

## Synthesis

Across all nine deliverables, three convergent patterns emerge:

1. **The prevent-vs-disclose line falls along deterministic boundaries.** Idempotency (preventable via UUID `Idempotency-Key`), Keychain isolation (preventable via `clearKeychain`), OTA rollback (preventable via `fingerprint` policy plus `eas update:rollback`), and PII scrubbing (preventable via `dataCollection` allow-deny lists and OTel Redaction Processor fail-closed mode) all reduce to testable invariants. App Store ranking, iOS Local Network permission, and human mis-tap are irreducibly probabilistic and require truthful UX disclosure.

2. **Platform constraints in July 2026 force dual-platform discipline.** Expo SDK 55's removal of Legacy Architecture [1] means Hermes ships only one Fabric/TurboModule implementation; this reduces test surface but eliminates the option to fall back when something breaks. React Native 0.83's first no-breaking-changes release [35] lowers upgrade risk but does not guarantee ABI stability. Tailscale Funnel remains beta and is not a substitute for direct connections [89].

3. **CI is the only system where failure is cheap enough to be useful.** Branch protection with required checks plus concurrency groups prevents the dominant cause of false-positive CI gates (path-filtered pending checks) Concurrency; physical-device runners for iOS and Android are non-negotiable for release gating; EAS Build integration from CI keeps the human-in-the-loop out of the critical path [32].

The architectural intent is to prevent what is mechanically preventable, surface what is not via truthful status copy, and to keep CI's role limited to verification rather than to fixing the app at runtime.

## References

1. *Expo SDK 55 - Expo Changelog*. http://expo.dev/changelog/sdk-55
2. *Changelog - Expo*. https://expo.dev/changelog
3. *OTA update fetched by EAS dev client but not installed on ...*. https://github.com/expo/expo/discussions/17230
4. *What's New in React Native 0.83, React 19.2, New DevTools ...*. https://tube.wave.co/whats-new-in-react-native-083-react-192-new-devtools-feature-jDQT2Rw6i6Q
5. *What's New in Expo SDK 55 - Medium*. https://medium.com/%40onix_react/whats-new-in-expo-sdk-55-6eac1553cee8
6. *Keep PII Out of Your Telemetry: Sanitizing Logs, Traces, and ...*. https://oneuptime.com/blog/post/2025-11-13-keep-pii-out-of-observability-telemetry/view
7. *Data Scrubbing - Sentry Docs*. https://docs.sentry.io/security-legal-pii/scrubbing
8. *title: "Data Collected" description: "See what data is collected by the Sentry SDK." url: https://docs.sentry.io/platforms/javascript/data-management/data-collected/*. http://docs.sentry.io/platforms/javascript/data-management/data-collected
9. *Scrubbing Sensitive Data | Sentry for Native*. https://docs.sentry.io/platforms/native/data-management/sensitive-data
10. *Scrubbing Sensitive Data | Sentry for Python*. https://docs.sentry.io/platforms/python/data-management/sensitive-data
11. *DNS Resolution and MagicDNS | tailscale/tailscale | DeepWiki*. https://deepwiki.com/tailscale/tailscale/7.1-dns-resolution-and-magicdns
12. *Tailscale API*. https://tailscale.com/docs/reference/tailscale-api
13. *MagicDNS - Tailscale Docs*. https://tailscale.com/docs/features/magicdns
14. *DERP servers - Tailscale Docs*. https://tailscale.com/docs/reference/derp-servers
15. *DERP Relay System | tailscale/tailscale | DeepWiki*. https://deepwiki.com/tailscale/tailscale/4.4-derp-relay-system
16. *What is Maestro?*. http://docs.maestro.dev/get-started/what-is-maestro
17. *Maestro tests not finding buttons via strings or ids, with ...*. https://github.com/mobile-dev-inc/Maestro/issues/1056
18. *Maestro documentation | Maestro Docs*. https://docs.maestro.dev/
19. *Maestro – Next generation mobile UI automation*. http://news.ycombinator.com/item?id=43174453
20. *Fetched web page*. http://linkedin.com/company/maestro-dev
21. *Trigger builds from CI*. http://docs.expo.dev/build/building-on-ci
22. *Apple Github Actions (iOS & macOS)*. http://github.com/Apple-Actions
23. *Branch protections when actions use paths-ignore #54877 - GitHub*. https://github.com/orgs/community/discussions/54877
24. *GitHub - expo/expo-github-action: Expo GitHub Action makes it ...*. https://github.com/expo/expo-github-action
25. *About protected branches*. http://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
26. *Categories and Discoverability - App Store*. https://developer.apple.com/app-store/categories
27. *Discover Mobile - App Store*. https://apps.apple.com/us/app/discover-mobile/id338010821
28. *Visible mobile - App Store - Apple*. https://apps.apple.com/cy/app/visible-mobile/id1367950045
29. *Visible mobile - App Store - Apple*. https://apps.apple.com/us/app/visible-mobile/id1367950045
30. *App Store search - Apple Developer*. https://developer.apple.com/app-store/search
31. *title: "Data Collected" description: "See what data is collected by the Sentry SDK." url: https://docs.sentry.io/platforms/javascript/data-management/data-collected/*. https://docs.sentry.io/platforms/javascript/data-management/data-collected/
32. *modificationDate: June 11, 2026 title: Trigger builds from CI description: Learn how to trigger builds on EAS for your app from a CI environment such as GitHub Actions and more.*. https://docs.expo.dev/build/building-on-ci
33. *Debugging Basics*. https://reactnative.dev/docs/debugging
34. *React Native DevTools*. https://reactnative.dev/docs/react-native-devtools
35. *React Native 0.83 - React 19.2, New DevTools features, no ...*. https://reactnative.dev/blog/2025/12/10/react-native-0.83
36. *React Native New Architecture: Fabric & TurboModules for ...*. https://techifysolutions.com/blog/react-native-new-architecture-fabric-turbomodules
37. *Privacy controls - Docs - PostHog*. http://posthog.com/docs/session-replay/privacy
38. *GDPR compliant posthog tracking without consent - Patrik Simms*. https://www.psimms.de/posts/gdpr-compliant-posthog-tracking-without-consent
39. *Controlling data collection - Docs*. https://posthog.com/docs/privacy/data-collection
40. *PostHog & HIPAA compliance - Docs*. https://posthog.com/docs/privacy/hipaa-compliance
41. *BAA - PostHog*. https://posthog.com/baa
42. *iOS Privacy Manifest: The 2026 Developer Guide to xcprivacy ...*. http://pushmyapp.ai/blog/ios-privacy-manifest-guide
43. *Privacy manifest files | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
44. *iOS 17 Privacy Manifest Requirements*. http://developer.adobe.com/client-sdks/resources/privacy-manifest
45. *iOS Privacy Manifest (PrivacyInfo.xcprivacy): Complete Guide 2026 | AppTester.co*. http://apptester.co/blog/ios-privacy-manifest-guide
46. *Privacy manifests - Expo Documentation*. https://docs.expo.dev/guides/apple-privacy
47. *Conditions | Flows | Maestro Docs*. https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions
48. *runFlow | API Reference | Maestro Docs*. https://docs.maestro.dev/reference/commands-available/runflow
49. *Advanced Flow Features | mobile-dev-inc/maestro-docs | DeepWiki*. https://deepwiki.com/mobile-dev-inc/maestro-docs/6-advanced-flow-features
50. *How to clear the state of the app in Maestro tests (iOS) - Medium*. https://medium.com/%40michaelmavris/how-to-clear-the-state-of-the-app-in-maestro-tests-ios-d27805092d42
51. *clearKeychain | API Reference | Maestro Docs*. https://docs.maestro.dev/reference/commands-available/clearkeychain
52. *ASO in 2026: New App Store & Play Ranking Signals — ASOScan*. https://asoscan.com/blog/aso-ranking-factors-2026
53. *Google Play Console is a horrible experience. App in review for 2.5 ...*. https://www.reddit.com/r/GooglePlayDeveloper/comments/1j24i4r/google_play_console_is_a_horrible_experience_app
54. *ASO in 2026: The Complete Guide to App Optimization*. https://asomobile.net/en/blog/aso-in-2026-the-complete-guide-to-app-optimization
55. *App Store Optimization for Android Apps, A Beginner's Guide deveshrx.com https://blog.deveshrx.com › ...*. https://blog.deveshrx.com/app-store-optimisation-on-google-play-store
56. *Main store listing - Google Play Console*. http://play.google.com/console/about/storelistings
57. *Idempotency in APIs - Why Your Retry Logic Can Break ...*. https://dev.to/fazal_mansuri_/idempotency-in-apis-why-your-retry-logic-can-break-everything-and-how-to-fix-it-345k
58. *Idempotency-Key header - HTTP | MDN - MDN Web Docs*. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Idempotency-Key
59. *The Idempotency-Key HTTP Header Field*. https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-01.html
60. *Exponential Backoff with Jitter — The Secret to Smooth Retries*. https://kangclaw.github.io/posts/exponential-backoff-with-jitter
61. *draft-ietf-httpapi-idempotency-key-header-04*. https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-04
62. *Store listings | Google Play Console*. https://play.google.com/console/about/storelistings
63. *Privacy controls - Docs - PostHog*. https://posthog.com/docs/session-replay/privacy
64. *Updates - Expo Documentation*. https://docs.expo.dev/versions/latest/sdk/updates
65. *Runtime versions and updates - Expo Documentation*. https://docs.expo.dev/eas-update/runtime-versions
66. *Manage branches and channels with EAS CLI - Expo Documentation*. https://docs.expo.dev/eas-update/eas-cli
67. *Rollbacks - Expo Documentation*. https://docs.expo.dev/eas-update/rollbacks
68. *OTA Updates in a Production Expo App: Signing, Fingerprinting ...*. https://medium.com/%40_.sirsha/ota-updates-in-a-production-expo-app-signing-fingerprinting-tagging-and-rolling-out-safely-edee6df07f76
69. *Control the concurrency of workflows and jobs*. http://docs.github.com/enterprise-cloud%40latest/actions/using-jobs/using-concurrency
70. *Is it possible to use an expression in concurrency cancel-in-progress · community · Discussion #69704 · GitHub*. http://github.com/orgs/community/discussions/69704
71. *Control the concurrency of workflows and jobs*. http://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs
72. *http://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks*. http://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks
73. *Workflow syntax for GitHub Actions*. http://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
74. *Device approval · Tailscale Docs*. http://tailscale.com/docs/features/access-control/device-management/device-approval
75. *How to Use ACL Tags for Device Access in Tailscale*. http://tailscale.com/blog/acl-tags-ga
76. *non-ephemeral Key for docker container · Issue #7070*. https://github.com/tailscale/tailscale/issues/7070
77. *tailscale_tailnet_key | Resources | tailscale/tailscale | Terraform | Terraform Registry*. http://registry.terraform.io/providers/tailscale/tailscale/latest/docs/resources/tailnet_key
78. *How to have a reusable preauth key that does not expire?*. http://github.com/juanfont/headscale/issues/1550
79. *Google Play Data Safety Form: 2026 Requirements Guide*. https://respectlytics.com/blog/google-play-data-safety-guide
80. *Google Play Data Safety Form: The Complete Walkthrough for 2026*. https://www.applander.io/blog/google-play-data-safety-form-complete-guide
81. *Permissions on Android | Privacy | Android Developers*. https://developer.android.com/guide/topics/permissions/overview
82. *Provide information for Google Play's Data safety section*. https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
83. *Platos: Real Friend AI - Apps on Google Play*. http://play.google.com/store/apps/details?id=com.prislay.javine
84. *Redaction Processor - opentelemetry-collector-contrib - GitHub*. https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/redactionprocessor/README.md
85. *semantic-conventions/docs/http/http-metrics.md at main*. https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md
86. *OpenTelemetry Instrumentation Best Practices for ...*. https://sematext.com/blog/opentelemetry-instrumentation-best-practices-for-microservices-observability
87. *Semantic conventions for events*. https://opentelemetry.io/docs/specs/semconv/general/events
88. *OpenTelemetry Best Practices 2026: Improve Monitoring & ...*. https://www.apica.io/blog/opentelemetry-best-practices-for-improving-your-monitoring-and-observability
89. *Tailscale Funnel · Tailscale Docs*. https://tailscale.com/docs/features/tailscale-funnel
90. *Tailscale Serve · Tailscale Docs*. http://tailscale.com/docs/features/tailscale-serve
91. *Tailscale Funnel — Expose Services Without Port Forwarding*. http://mylinux.work/guides/tailscale-funnel-setup
92. *FR: use Tailscale node as a Funnel relay · Issue #15946 - GitHub*. https://github.com/tailscale/tailscale/issues/15946
93. *tailscale serve command*. http://tailscale.com/docs/reference/tailscale-cli/serve
94. *NetInfo*. https://archive.reactnative.dev/docs/netinfo
95. *@react-native-community/netinfo - npm*. https://www.npmjs.com/package/%40react-native-community/netinfo
96. *isInternetReachable is returning null on first attempt on ios #572*. https://github.com/react-native-netinfo/react-native-netinfo/issues/572
97. *addEventListener not updated when connection change*. https://github.com/react-native-netinfo/react-native-netinfo/issues/573
98. *Network Information API - MDN Web Docs - Mozilla*. http://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
99. *Play Integrity API | Android Developers*. https://developer.android.com/google/play/integrity
100. *Overview of the Play Integrity API - Android Developers*. https://developer.android.com/google/play/integrity/overview
101. *Get started using App Check with App Attest on Apple platforms*. https://firebase.google.com/docs/app-check/ios/app-attest-provider
102. [[PDF] APPLICATION FOR ATTESTATION / CERTIFICATION](https://www.bdcgny.org/uploads/forms/attestation_form.pdf)
103. [[iOS/WWDC] App Attest & Device Check - 준진의 블로깅 티스토리 https://jooeungen.tistory.com › iO...](https://jooeungen.tistory.com/entry/iOSWWDC-App-Attest-Device-Check)
104. *How to Implement SSL Pinning in React Native - oneuptime.com*. https://oneuptime.com/blog/post/2026-01-15-react-native-ssl-pinning/view
105. *React Native SSL Pinning. Why you need SSL pinning in your ...*. https://medium.com/%40aligabalh90100/react-naive-ssl-pinning-85ffa6ab687f
106. *Stop React Native Certificate Pinning Bypass Attacks*. https://www.metatech.dev/blog/2025-07-07-stop-react-native-certificate-pinning-bypass-attacks
107. *expo-secure-store*. https://www.npmjs.com/package/expo-secure-store?activeTab=dependents
108. *React Native SSL Pinning Bypass (Frida Tutorial) | PTKD Journal*. https://ptkd.com/journal/react-native-ssl-pinning-bypass-frida
109. *iOS local network privacy permission explained | PTKD Journal*. https://ptkd.com/journal/ios-local-network-privacy-permission
110. *iOS 18 local network permission is… | Apple Developer Forums*. https://developer.apple.com/forums/thread/766133
111. *Key UX Differences: iOS vs Android in 2025 - Medium*. https://medium.com/%40markeltree/key-ux-differences-ios-vs-android-in-2025-6475855e2afe
112. *Patterns | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/patterns
113. *Experimenting with Apple Device Proximity Pairing Using ...*. https://ecto-1a.github.io/AppleJuice
