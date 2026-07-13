# Technical Debt Audit — 2026-07-13

Base: `origin/main` at `339f7273`

Audit branch: `codex/tech-debt-hygiene-20260713`

Scope: every Git-tracked file. Generated/vendor/archive trees were checked by manifest, parser, integrity, duplication, link, and secret scans; production code received language-aware static analysis and targeted manual review.

## Result

| Metric | Before | After |
|---|---:|---:|
| Tracked files | 1,023 | 1,008 |
| Raw tracked text lines | 155,140 | 153,387 |
| SCC-recognized files | 933 | 922 |
| SCC total lines | 141,723 | 140,455 |
| Jest line coverage | 71.46% | 71.53% |
| Zero-covered modules | 5 | 3 |
| Broken local Markdown links | 10 | 3 archived-snapshot links |
| Python Ruff failures (`F`, `E722`) | 2 | 0 |

Audit accounting:

- Files scanned: every tracked file (1,023 cleanup-base baseline).
- Issue categories found: 17.
- Issue categories fixed: 11.
- Issue categories documented for follow-up: 6.
- Files deleted: 17.
- Artifact lines deleted: 1,986.
- Net tracked text lines removed: 1,753.
- RAG entries destructively cleaned: 0; ThumbGate exposes supported recall/capture/verification operations but no safe delete-or-merge operation.

The session initially measured `86b26a46` at 1,020 files / 154,444 text lines. PR #210 merged three files while the audit was running, so the before/after table deliberately rebases both sides to the current cleanup base `339f7273`; this prevents concurrent work from being misreported as cleanup.

## What was fixed

### Dead and unsafe artifacts

Production import-graph analysis and repository-wide reference searches proved eight source modules had no production inbound edge. Their dedicated tests did not make the runtime code live. Those 14 source/test files were removed together:

- `hermes-mobile/src/components/HermesPersonaCard.tsx`
- `hermes-mobile/src/__tests__/HermesPersonaCard.test.tsx`
- `hermes-mobile/src/components/LeashApprovalBanner.tsx`
- `hermes-mobile/src/components/RelayPairStrip.tsx`
- `hermes-mobile/src/utils/chatBootstrap.ts`
- `hermes-mobile/src/__tests__/chatBootstrap.test.ts`
- `hermes-mobile/src/utils/chatTimeline.ts`
- `hermes-mobile/src/__tests__/chatTimeline.test.ts`
- `hermes-mobile/src/utils/recentPromptActions.ts`
- `hermes-mobile/src/__tests__/recentPromptActions.test.ts`
- `hermes-mobile/src/utils/telegramSync.ts`
- `hermes-mobile/src/__tests__/telegramSync.test.ts`
- `hermes-mobile/src/utils/toolResultTerminalRecovery.ts`
- `hermes-mobile/src/__tests__/toolResultTerminalRecovery.test.ts`

Three additional tracked artifacts were removed:

- `hermes-mobile/scripts/download_logs.py` — unreferenced, missing `json`, used a bare `except`, and embedded an expired signed storage URL.
- `hermes-mobile/assets/source.glow-backup-20260626/TabBarIcon.tsx.bak` — tracked backup superseded by the live component.
- `hermes-mobile/.maestro/test-hide.yaml` — byte-for-byte duplicate of `hide-keyboard-safe.yaml`; leaving both caused a redundant Maestro flow.

### Documentation integrity

Seven live-document link failures were repaired:

- malformed investigation UUID rendered as a nonexistent relative file;
- an absolute `file:///Users/...` vault link;
- three references to nonexistent `BETA-LAUNCH-CAMPAIGN-RESEARCH.md`;
- an intentionally private `business_os` file represented as a public relative link;
- an incorrect Fastlane-to-docs relative path.

The remaining three failures are inside `Compiled-Vaults/compiled-vault-brain-2026-06-29`, an explicitly archived reference snapshot. Rewriting snapshot provenance would be less honest than documenting the drift.

### Dependency and merge policy

- Jest and `@types/jest` major updates are now held until an Expo SDK upgrade. PR #65 proved Jest 30 violates Expo SDK 55's Jest 29 contract.
- `react-test-renderer` is held at the exact SDK-pinned React version. PR #64 proved renderer 19.2.7 cannot resolve against React 19.2.0.
- Broad PR auto-merge now excludes Dependabot. Semver-safe bot updates remain owned by `.github/workflows/dependabot-automerge.yml`; major updates require compatibility review.
- `tests/test-dependency-automation-policy.js` adds 15 regression assertions for those controls and the new CI gates.

### CI coverage

- Shell syntax now checks every tracked `.sh` file with its declared shell, plus the extensionless `yolo-health` entrypoint.
- Python CI now parses every tracked `.py` file and runs pinned Ruff `0.15.20` rules `F` and `E722`.
- Secret smoke scans now cover classic and fine-grained GitHub tokens, xAI keys, Google API keys, signed Google storage URLs, Stripe live keys, and Telegram/Stripe assignments.
- The local `scripts/ci-verify.sh` mirrors these checks without writing bytecode into the repository.

## Verification evidence

| Gate | Result |
|---|---|
| JavaScript/CJS syntax | 192/192 parsed |
| Shell syntax | 64/64 tracked `.sh` files plus `yolo-health` parsed |
| Python AST + Ruff | 7/7 parsed; 0 `F`/`E722` findings |
| JSON / YAML / plist | 22 / 45 / 4 parsed |
| Swift syntax | 8/8 parsed |
| TypeScript | `tsc --noEmit` passed |
| Root Node tests | 48/48 test files passed |
| Mobile Jest | 155/155 suites; 1,268 passed, 1 skipped |
| Release safety | 4/4 suites; 64 passed, 1 skipped |
| Expo Doctor | 19/19 checks passed |
| Release readiness | passed |
| Maestro schema | 25/25 flows valid |
| Mobile privacy scan | passed |
| Gateway watchdog unit / E2E | 15/15 and 14/14 passed |
| Mobile pairing contract | 11/11 passed |
| ADB reverse filter | 7/7 passed |
| Guard E2E | 16/16 passed |
| Public funnel checks | all passed; 0 broken public links |

Coverage after cleanup:

```text
Statements: 71.14% (8,480 / 11,920)
Branches:   65.04% (6,972 / 10,719)
Functions:  70.40% (1,508 / 2,142)
Lines:      71.53% (8,227 / 11,501)
```

## Remaining debt and blockers

1. `@react-native-ai/dev-tools@0.12.0` pulls four moderate OpenTelemetry advisories. The direct dependency is already at its latest release, which still pins the affected OpenTelemetry 1.x packages. A forced OpenTelemetry 2.x override is not API-safe, so this remains an upstream blocker with zero high/critical advisories.
2. Three modules still have zero line coverage: `src/__perf__/chatMessageDisplay.perf-test.ts`, `src/components/ChatContextStrip.tsx`, and `src/hooks/useGatewaySelector.ts`.
3. The otherwise-green Jest run emits pre-existing React `act(...)` warnings and a stale `resolveApiKeyForProfile` mock warning in `ChatScreen` coverage. Those files are actively claimed by other agents and were not modified.
4. Five Kotlin files (378 lines) are wired through the native AI-glasses plugin but could not receive a local compiler gate because no Kotlin compiler is installed. Their wiring and source references were manually verified.
5. Physical-device E2E remains unverified in the latest continuous receipt: the USB phone is attached, but the protected LaunchAgent and PR #226's single-instance verification overlapped on the same device, producing an ADB/Maestro transport failure. Unit verification passed. The duplicate LaunchAgent process was stopped without touching the other agent's run; a fresh single-owner receipt is still required.
6. The Hermes decision loop reports Telegram ingress conflicts despite a healthy local gateway. Runtime health and ingress ownership need a separate operational repair; this audit does not claim that blocker fixed.

## RAG and ML assessment

ThumbGate recall was useful for preventing false completion claims and for enforcing worktree/file-ownership boundaries. The exact technical-debt query returned no direct prior lesson, which is a retrieval gap to fill with the final concrete audit lesson. The weak-supervision Hermes decision loop was useful for surfacing Telegram/ingress risk, but its `gateway service not loaded` label conflicts with the independently healthy `:8642` endpoint and should not be treated as sole-source truth.

No raw RAG database files were edited. Supported capture and recall operations will be used to record and read back this audit; destructive deduplication is deferred until ThumbGate exposes a provenance-preserving supersede/delete API.
