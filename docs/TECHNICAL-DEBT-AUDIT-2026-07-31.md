# Technical debt audit — 2026-07-31

## Verdict

This audit scanned every file tracked by Git and was reconciled to `origin/main` commit
`fba6f8de9`. The cleanup is safe and locally green,
but the repository is **not** at 100% operational reliability or 100% coverage.
The exact remaining gaps are recorded below rather than hidden behind a completion claim.

The audit ran in an isolated worktree on branch
`codex/technical-debt-audit-20260731`; the user's dirty shared checkout was not modified.

## Executive metrics

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Git-tracked files | 2,044 | 2,039 | -5 |
| Git-tracked text lines | 351,183 | 351,038 | -145 |
| Files deleted | 0 | 6 | -6 |
| Gross changed lines removed | 0 | 358 | -358 |
| Exact duplicate groups | 25 | 24 | -1 |
| Python selected-lint findings | 4 | 0 | -4 |
| ShellCheck findings (`*.sh`) | 328 | 326 | -2 |
| Finding categories | 17 | 10 open | 7 fixed |
| RAG records deleted/merged | 0 | 0 | 0 |

`Gross changed lines removed` includes deleted files and removed redundant/dead lines before
adding this evidence report. Net repository line count includes this report and the one-line
coordination claim, so it is intentionally reported separately.

## Scope and inventory

The final inventory covered all 2,044 tracked files and 262 tracked directories. Of those files,
1,969 were text and 75 were binary, totaling 45,566,949 bytes. The tree contained 480 test
files and 22 GitHub Actions workflow files.

Largest language groups measured with SCC:

| Language | Files | Lines | Code |
|---|---:|---:|---:|
| TypeScript | 624 | 111,714 | 99,382 |
| JavaScript | 427 | 106,073 | 94,714 |
| Markdown | 402 | 42,079 | 31,905 |
| JSON | 80 | 27,065 | 27,065 |
| Shell | 152 | 17,981 | 14,085 |
| Python | 25 | 8,184 | 7,193 |
| YAML | 73 | 5,895 | 5,015 |
| Swift | 8 | 526 | 455 |
| Kotlin | 5 | 378 | 333 |

Syntax and format inventory results:

- 414 tracked JavaScript/CommonJS/ESM files passed `node --check`.
- 25 Python files passed AST parsing; the selected deterministic Ruff gate now passes.
- 86 JSON files, 73 YAML files, and 30 plists parsed successfully.
- 8 Swift files passed `swiftc -parse`.
- 5 Kotlin files were inventoried but could not be compiled because no Kotlin compiler was
  installed. Their Expo config-plugin wiring was verified instead.
- The tracked-only Gitleaks scan found zero findings. Generated coverage and local index data
  were excluded by scanning a fresh `git archive` of `origin/main` with `.gitleaks.toml`.

## Fixes applied

Seven finding categories were fixed:

1. Deleted unreachable `ChatQuickActions.tsx` and its test. Exact import-graph and repository
   searches found no production consumer; the feature had already been removed from ChatScreen.
2. Deleted four unreferenced files under the explicitly dated
   `assets/source.glow-backup-20260626/` directory. One was byte-identical to the live source;
   the other three had no references. All remain recoverable from Git history.
3. Replaced three ambiguous one-letter Python variables (`E741`) with descriptive names.
4. Replaced the assigned lambda in `build_dataset.py` (`E731`) with a named local function.
5. Removed a no-op command substitution from `test-global-phone-pipeline-lock.sh`; the test still
   passes all 11 assertions.
6. Removed 44 redundant explicit `node --check` lines from `scripts/ci-verify.sh`; the preceding
   tracked-file loop already checks every JavaScript file, including all paths removed here.
7. Expanded local and GitHub Python gates from `F,E722` to `F,E722,E731,E741`, preventing all four
   repaired Python defects from recurring.

### Deleted files and justification

- `hermes-mobile/src/components/ChatQuickActions.tsx` — unreachable production component.
- `hermes-mobile/src/__tests__/ChatQuickActions.test.tsx` — test for unreachable component.
- `hermes-mobile/assets/source.glow-backup-20260626/adaptive-foreground.svg` — unreferenced dated backup.
- `hermes-mobile/assets/source.glow-backup-20260626/adaptive-monochrome.svg` — unreferenced dated backup.
- `hermes-mobile/assets/source.glow-backup-20260626/hermes-h-mark.svg` — unreferenced dated backup,
  byte-identical to `assets/source/hermes-h-mark.svg`.
- `hermes-mobile/assets/source.glow-backup-20260626/icon-master.svg` — unreferenced dated backup.

## Coverage and tests

There is no honest single repository-wide percentage: the repository is polyglot and several
test roots do not collect coverage. The directly measured coverage surfaces are:

| Package | Before | After | Tests after |
|---|---|---|---:|
| Hermes Mobile | 77.17% lines / 70.45% branches / 77.46% functions | 77.16% lines / 70.44% branches / 77.42% functions | 2,306 passed, 1 skipped |
| Control plane covered modules | 95.00% lines / 91.93% branches / 100% functions | unchanged | 115 passed |
| Dashboard | 95.51% lines / 86.49% branches / 96.55% functions | unchanged | 8 passed |
| Protocol | 98.32% lines / 94.13% branches / 100% functions | unchanged | 77 passed |
| Cloud runner | not collected | not collected | 5 passed |
| Relay | not collected | not collected | 12 passed |
| ML reliability pipeline | not collected | not collected | 12 passed |

The 0.01-point mobile movement is denominator churn from deleting a fully covered but unreachable
component, not a live-path regression. No new tests were added because the implementation under
test was itself dead; keeping or replacing that test would preserve debt rather than reliability.

## Full local verification

The final `./scripts/ci-verify.sh` run passed, including:

- JavaScript, shell, and Python static gates;
- root guard, orchestration, public-funnel, command-reference, and secret-smoke checks;
- Expo release readiness, TypeScript, and Expo Doctor 19/19;
- Hermes Mobile 255/255 suites and 7/7 release-safety suites;
- 2,306 mobile tests passed, 1 intentional skip;
- public revenue funnel safety passed, while publication truth correctly remained
  `NOT_PUBLISHED_FROM_LOCAL_STATE`.

Package verification also passed independently: control plane 115, dashboard 8, protocol 77,
cloud runner 5, relay 12, and ML pipeline 12 tests.

## Protected systems snapshot

| Surface | Before | After |
|---|---|---|
| ThumbGate RAG recall | readable, returned a context pack | readable after cleanup, returned a context pack |
| Claude hooks | valid JSON; 1 SessionStart and 1 UserPromptSubmit hook | unchanged and valid |
| mac-freeze-rescue skill | present | present |
| Simulator guardian | loaded; 60-second interval; last exit 0 | running; 60-second interval; last exit 0 |
| Continuous mobile E2E | loaded; 900-second interval; last exit 0 | unchanged; last exit 0 |
| Latest continuous proof | skipped because the physical phone was awake/in use | unchanged; no false pass claimed |
| Local orchestration | gateway HTTP healthy; decision stack flagged unrelated Telegram/local-fallback blockers | cleanup did not change these states |

RAG cleanup count is zero because the available provider surface supports recall and capture but
does not expose safe record deletion/merge. The audit does not mutate the raw RAG database behind
the provider. A capture of the PR ownership-gate lesson was attempted after publication, but its
write/read verification timed out; no successful RAG mutation is claimed.

## Dependency and security findings

- Control plane, dashboard, and protocol lockfiles report zero npm audit vulnerabilities.
- Hermes Mobile reports 18 high, 0 critical vulnerabilities even with `--omit=dev`; the full
  lockfile reports 40 high, 0 critical. They are transitive through the Expo/React Native toolchain
  (`glob`, `minimatch`, `brace-expansion`, Jest/Babel, CLI middleware). `npx expo install --check`
  says dependencies are compatible and Expo Doctor passes 19/19. npm's proposed fixes require
  incompatible major changes, so this audit does not violate the repository's Expo SDK pin rule.
- `npm outdated` shows major upgrades available (including Expo 55 to 57, React Native 0.83 to
  0.86, React Navigation 6 to 7, and Jest 29 to 30). These require a dedicated SDK-upgrade lane,
  device verification, and release evidence rather than blind dependency churn.
- Gitleaks found zero tracked-secret findings. No credential from chat or local state was used.

## Remaining debt — explicit blockers and owners

Ten finding categories remain:

1. **Mobile coverage:** 77.16% lines and 70.44% branches, not 100%. Zero-line files include a perf
   harness plus `ChatContextStrip`, `monetization`, and `useGatewaySelector`; several are currently
   claimed by active mobile tasks.
2. **Mobile test warnings:** asynchronous `ChatScreen` and `GatewayContext` state updates emit
   React `act(...)` warnings. ChatScreen and its tests are active multi-agent hot files.
3. **Control-plane compile debt:** raw `tsc --noEmit` fails on pre-existing target/type/test-import
   issues. The broad control-plane lane is actively claimed; its 95% coverage figure covers only
   three security/session modules and must not be read as whole-app coverage.
4. **Control-plane lint debt:** ESLint reports three warnings (one raw `<img>`, one unused helper,
   one unused test import), also under active claims.
5. **Shell static debt:** ShellCheck now reports 39 warnings. Its sole `error` is SC1071 for an
   intentional zsh script, which ShellCheck does not support; syntax still passes `zsh -n`/CI.
6. **Dependency advisories:** the 18 production/high Expo-chain findings need a deliberate Expo
   SDK upgrade, not `npm audit fix --force`.
7. **Repository hygiene:** 24 exact-duplicate groups remain, mostly intentional redirects,
   cross-store metadata, raw/sanitized evidence, or mirrored deployment files. The live
   control-plane/mobile formatted-block duplication is real but currently claimed.
8. **Text hygiene:** 46 files lack a terminal newline and 86 contain trailing whitespace, largely
   generated research/coordination evidence. Bulk normalization would create high-risk noisy diffs.
9. **Reachability:** nine mobile production/type files are outside the current `App.tsx` import
   graph; several are test-only contracts, declarations, actively claimed features, or touched by
   open PR #1173. They were not deleted speculatively.
10. **Native/live proof:** Kotlin was not compiled locally; continuous physical-device E2E was
    skipped because the phone was in active use. GitHub branch checks are the remaining remote
    evidence surface and are recorded below.

## CI health

- Previous completed main CI evidence: [run 30590584192](https://github.com/IgorGanapolsky/mac-yolo-safeguards/actions/runs/30590584192) — success.
- Current audited main SHA CodeQL run: [run 30642068936](https://github.com/IgorGanapolsky/mac-yolo-safeguards/actions/runs/30642068936) — queued at the final reconciliation snapshot.
- Pull request: [draft PR #1271](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1271)
- Prior branch head `871119ffd` completed every executed GitHub check successfully, including
  macOS guard kit, mobile typecheck/tests, Android Maestro, Swift CodeQL, and security providers.
  The final reconciled head must be read from the live PR; no future green verdict is claimed in
  this static report.

## Completion status

Audit and verified cleanup are complete for the unowned files listed above. Core local systems are
operational and the full local CI mirror passes. The repository is **not** at 100% coverage, the
mobile dependency advisories remain, and remote branch CI must finish before any merge claim.

No new repository standard was introduced, so `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` were not changed.
The remaining gaps above serve as the follow-up audit queue; no calendar automation was created
because the user requested an audit, not a recurring external schedule.
