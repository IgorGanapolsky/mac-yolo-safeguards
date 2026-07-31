# Hermes Mobile Reliability — July 2026 Research and Current-State Audit

Date: 2026-07-29

Deep-research run: `trun_468ec6a2702a4592865d87f871c6a704`

Raw report: `parallel-research/hermes-mobile-reliability-july-2026.md`

Run receipt: <https://platform.parallel.ai/play/deep-research/trun_468ec6a2702a4592865d87f871c6a704>

## Decision

Hermes does not have “no tests.” It has broad Jest, release-safety, Android
Maestro, iPad-simulator, continuous-device, privacy, OTA, and mutation-controlled
incident gates. The reliability gap exposed by the July screenshots is that
those surfaces were not tied together in one fail-closed incident ledger.

That missing control is now implemented:

- `evals/incidents/hermes-mobile-july-2026.json` records all nine incidents;
- `tools/hermes-reliability-traceability.js` separates audit, release, and claim
  readiness;
- `tests/test-hermes-reliability-traceability.js` is automatically discovered by
  the existing root CI Node-test loop; and
- `docs/HERMES-RELIABILITY-TRACEABILITY.md` defines the proof contract.

The honest result today is:

- structural audit: **pass**;
- product release readiness: **blocked by 7 runtime incidents**; and
- broad “all gaps fixed” / store-discoverability claim: **blocked by all 9**.

This is deliberate. The control must not turn open PRs, queued jobs, skipped
physical-device runs, or a published store page into product proof.

## Method

The external research covered Expo SDK 55 / React Native 0.83, Tailscale DERP
and MagicDNS, pairing authorization, Maestro isolation, idempotent HTTP
requests, Apple privacy manifests, Google Play/App Store discoverability,
privacy-safe telemetry, EAS rollback, and GitHub Actions concurrency.

Every recommendation was then checked against:

1. current `origin/main` source and tests;
2. live GitHub PR head revisions and check states;
3. the current continuous-device artifact; and
4. public store publication/search evidence.

The external report is a source review, not current-repository truth. The local
readback below supersedes generic “missing” claims from the raw report.

## Current-Repository Corrections

| Research hypothesis | Current repository evidence | Verdict |
|---|---|---|
| Apple privacy manifest is missing | `hermes-mobile/app.json` already declares collected data plus file timestamp, UserDefaults, disk-space, and boot-time required-reason APIs | Already present |
| CI concurrency is unset | Root, mobile continuous, mobile E2E, iPad, OTA, store, protocol, and perf workflows already declare concurrency; production OTA/rollback intentionally serialize instead of canceling | Already present |
| Maestro lacks fresh-state isolation | Stranger/fresh-user and iPad edge flows clear state; release-safety tests enforce the relevant fresh-install contracts | Present on fresh-user gates; state-preserving relaunches intentionally do not clear |
| OTA rollback is interactive/manual | `.github/workflows/mobile-ota-rollback.yml` invokes signed `eas update:rollback` with `--non-interactive --json`, serializes with publishing, and verifies the channel afterward | Already present |
| Runtime policy should be changed blindly to `fingerprint` | Hermes deliberately uses `appVersion`; a July billing freeze disables automatic OTA checks until 2026-08-15 unless explicitly thawed | Do not change without a release migration |
| Sentry/PostHog privacy needs a new replay layer | Sentry is dormant without a DSN; PostHog uses a custom event client, production-only gates, user opt-out, and no session-replay SDK | Improve allow-listing, but do not add replay |
| Every retry needs an HTTP `Idempotency-Key` header | The observed mobile bug is one logical submission being recreated during recovery; PR #1174 introduces a client submission ledger and retry identity. The shared protocol already has `mutation_id` idempotency | Apply semantics at the existing protocol boundary; do not invent an incompatible header-only contract |

Official platform constraints still matter: Expo SDK 55 is New-Architecture
only and offers optional Hermes bytecode patching
([Expo SDK 55](https://expo.dev/changelog/sdk-55)); DERP is a fallback selected
when direct Tailscale connections fail
([Tailscale DERP](https://tailscale.com/docs/reference/derp-servers)); MagicDNS
hostname behavior has documented full-name and shared-device limits
([Tailscale MagicDNS](https://tailscale.com/docs/features/magicdns)); and Apple
requires declared privacy manifests for applicable SDK/API use
([Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)).

## Incident-to-Proof Matrix

Snapshot time: 2026-07-29T16:20Z. PR states can change after this readback; the
registry binds each snapshot to an exact 40-character head revision.

| Incident | Current remediation | Current proof | Missing proof |
|---|---|---|---|
| “Hermes AI” Play search does not show the paid app | PR [#1128](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1128), head `32da6eed…`, changes indexed title metadata | Paid package page is public | PR is behind with three failed/canceled Apple/iPad jobs; signed-out search visibility remains failed |
| “Hermes Mobile” is below top five | Same PR #1128 | Current signed-out US result was rank 6 | Top-five result after metadata is live and re-indexed |
| “Open Leash” shown without a pending approval | PR [#1176](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1176), head `1703b525…`, makes no-reply guidance conditional | Unit/typecheck/iPad checks passed on the branch | Android Maestro jobs were still running; no physical-device confirmation |
| “Find computers” returns none | Current main has forced cellular Tailscale probing plus remembered reachable-unpaired hosts | `ConnectMacGate.test.tsx` and `manualGatewayConnection.test.ts` are merged | Continuous physical-device evidence is yellow/skipped |
| Explicit Mac-mini Tailscale address cannot connect | PR [#1171](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1171), head `eb055d0d…`, covers a measured DERP-relayed delay | Unit/typecheck/macOS checks passed | iPad queued and Android Maestro running; physical DERP proof absent |
| “Do it now” renders twice | PR [#1174](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1174), head `2281ef45…`, adds a one-submission ledger | Unit and Android Maestro checks passed | PR behind; iPad proof queued; installed-device proof absent |
| Connected chat says the computer did not answer | PR #1176 adds structured no-reply/status guidance | Unit/typecheck/iPad checks passed | Android and physical-device completion |
| Retry arrow does nothing | PR #1174 makes retry reuse the failed logical submission | Unit and Android Maestro checks passed | PR behind; iPad and physical-device proof |
| Failed attachment retry loses the file | Draft PR [#1180](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1180), head `0c09757c…`, persists and rehydrates attachment payloads | 254/254 Jest suites; 2,263 passed + 1 intentional skip; Android ship-guard and stranger cold-start green | It is stacked on #1174; iPad job skipped and no physical-device proof |

Two related pairing PRs strengthen the manual-connect path but are not evidence
that the screenshot incident is fixed in the installed app:

- [#1173](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1173)
  redeems a fresh one-time pair code during “Re-pair this Mac”; it is behind and
  GitGuardian failed.
- [#1175](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1175)
  retries a rotated/spent pair code; its checks were green but the branch is
  behind.

## Reliability Architecture

### 1. Prevent what is deterministic

- One logical outbound submission gets one stable client identity across
  timeout, retry, app restart, and attachment rehydration.
- Reachability and pairing authorization stay separate. A reachable Mac with a
  wrong/missing key must not be labeled disconnected or silently discarded.
- A no-reply state must be derived from stream/run state; Leash is offered only
  when an approval is actually pending.
- Every fresh-user E2E starts empty. Later relaunch steps deliberately preserve
  state to prove persistence and must not be “fixed” by clearing it.
- OTA, store publication, installed build, and store-search rank remain
  independent evidence surfaces.

The IETF idempotency-key draft is useful protocol guidance—unique keys, conflict
on concurrent work, and payload-consistency checks—but is still a draft and
does not override Hermes’ existing mutation/submission identifiers
([IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-04)).

### 2. Disclose what is probabilistic

- DERP relay can increase latency; copy should identify a degraded relay path
  only when the transport can prove it.
- Local-network permission denial and cellular/captive-portal limitations need
  actionable manual-connect states.
- Store ranking is not a release-state boolean. Apple describes title,
  subtitle, keywords, category, and user behavior as search inputs
  ([App Store search](https://developer.apple.com/app-store/search)); Google
  supports custom listings, including search-keyword targeting
  ([Google Play store listings](https://play.google.com/console/about/storelistings)).

### 3. Observe without user content

Recommended event families:

| Event | Allowed attributes |
|---|---|
| `pair.outcome` | release, platform, transport class, outcome code, duration bucket |
| `discovery.outcome` | network class, candidate-count bucket, duration bucket |
| `send.outcome` | submission-id hash prefix, transport class, attachment-kind enum, outcome code |
| `retry.outcome` | same-submission boolean, retry-count bucket, outcome code |
| `stream.outcome` | terminal-state code, elapsed bucket, pending-approval boolean |

Forbidden: prompt/message bodies, attachment names/bytes, pair codes, API keys,
gateway URLs, hostnames, and raw IPs. Sentry documents the data its JavaScript
SDK collects ([Sentry data collected](https://docs.sentry.io/platforms/javascript/data-management/data-collected/));
PostHog documents replay masking controls
([PostHog privacy controls](https://posthog.com/docs/session-replay/privacy)).
Hermes does not currently need session replay to measure these SLOs.

## Test and CI Contract

The current stack is retained:

1. focused unit/integration tests for each runtime behavior;
2. release-safety/typecheck for mobile changes;
3. Android ship-guard plus stranger cold-start;
4. iPad simulator when the reserved trusted runner is available;
5. continuous physical-device evidence; and
6. exact store/provider readback for publication or discovery claims.

The new traceability gate adds the missing cross-cut:

- audit mode must pass in ordinary root CI;
- release mode stays blocked while a runtime incident lacks all required proof;
- claim mode also blocks unverified external outcomes such as top-five search;
- queued/skipped are invalid proof states; and
- mutation tests prove the gate detects false-green edits.

GitHub recommends branch/ref-scoped workflow concurrency and documents required
check behavior; Hermes already uses those controls
([Actions concurrency](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)).

## Network and Device Matrix

Each transport fix needs fresh-user coverage for:

| Condition | Required observation |
|---|---|
| Same Wi-Fi, permission granted | discovery, pair, send, retry |
| Same Wi-Fi, local-network permission denied | honest manual path, no false scan success |
| Cellular with direct Tailscale path | discovery/paste, pair, send |
| Cellular with DERP relay | bounded connect/send and relay-specific latency evidence |
| Captive portal/offline | bounded failure and retry; no forever spinner |
| Saved profile after cold restart | credential and selected-machine persistence |
| Expired/spent one-time code | fetch fresh code once; no infinite loop |
| Attachment failure then cold restart | same logical submission and original attachment rehydrated |

Emulator/simulator proves UI and deterministic app behavior. Only an actual
device on the specified network proves the transport path.

## 30/60/90-Day Sequence

### 0–30 days

- Land or reconcile #1171, #1173, #1174, #1175, #1176, and stacked #1180
  sequentially; do not merge red/behind branches.
- For every merge, update the registry from `open-pr` to `merged-unreleased`,
  then to `verified` only after all required evidence passes.
- Restore a green continuous physical-device proof; today’s yellow/skipped
  artifact blocks all seven runtime incidents.
- Re-run signed-out Play searches only after metadata is live and indexed.

### 31–60 days

- Emit the privacy-safe outcome events above and build transport-specific SLOs.
- Add controlled direct-versus-DERP network fixtures without hardcoding
  internet latency into unit tests.
- Measure duplicate-send, retry-success, pair-success, and timeout rates before
  choosing rollback thresholds.

### 61–90 days

- Gate OTA/store promotion on measured SLO regression plus current device
  evidence.
- Evaluate Expo Hermes patch support only with before/after binary size, apply
  success, rollback, and build-time data—never from the generic “75% smaller”
  headline alone.
- Promote store-search SLOs to a weekly measurement loop; never describe rank as
  guaranteed.

## What Is Not Proven

This setup does not prove that the open fixes are installed, that a physical
phone can currently reach the Mac mini over DERP, that the Play listing is in
the top five, or that every future incident is impossible. It makes those gaps
explicit, machine-checkable, privacy-safe, and difficult to launder into a
green claim.
