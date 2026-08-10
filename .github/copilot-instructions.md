# GitHub Copilot Agent & Workspace Instructions

Canonical directive for all GitHub Copilot Agents, Copilot Workspace sessions, and automated PR review agents operating on this repository.

---

## 1. Core Operating Directives

- **Multi-Agent Coordination**: Always respect repo locks in `plan.md` and Linear issue locks (`tools/linear-agent-bridge.js`). Never edit files claimed by another active agent.
- **Always Agent Mode**: Execute read-write and command tasks autonomously; never ask the user to run manual commands.
- **No Desktop Hijack**: Never launch headed Chrome, hijack macOS GUI focus, or touch Igor's daily profile unless explicitly requested in that message.
- **Zero Approval Debt**: Small, reviewable PR slices. Always run verification commands before declaring completion.

---

## 2. Verification & Quality Gates

Every code modification must pass verification before opening or merging a PR:
- **Unit & System Verification**: `bash scripts/verify.sh`
- **Mobile Unit Tests**: `npm test -- --no-coverage --watchman=false` (under `/hermes-mobile`)
- **CodeQL Security**: Zero new CodeQL alerts on `main`.

---

## 3. PR Creation & Speed Optimization

When creating or reviewing Pull Requests:
1. **Title Format**: Conventional commits (`feat(...)`, `fix(...)`, `ci(...)`, `docs(...)`).
2. **Body Metadata**: Include Linear ticket reference (`Closes AGENT-XX`), files modified, and explicit verification output (commit SHA, test run results).
4. **Auto-Merge Tagging**: If PR passes all CI checks and contains non-breaking code, enable auto-merge:
   ```bash
   gh pr merge <PR_NUMBER> --squash --auto
   ```
5. **Copilot code review on every PR**: Request an automated Copilot review before human review to catch regressions early and shrink review cycles.
   ```bash
   # via gh (requires you in CODEOWNERS/reviewers): tag Copilot as a reviewer
   gh pr edit <PR_NUMBER> --add-co "Copilot"
   # or leave a PR comment: @copilot review
   ```
6. **Copilot Autfix for security alerts (Aug 2026)**: For any new CodeQL/secret-scanning/dependency alert this PR introduces, open an autofix branch and reference it in the body. Track under § Risk.
7. **Agentic reply iteration**: Address review comments by replying `@copilot fix` / `@copilot apply` on the thread instead of hand-rolling — keeps cycles to a single touch.
8. **Merge queue + auto-rebase (kills #1407 conflict class)**: On protected branches, require the PR to be up to date with base before merge (or route through a merge queue) so lingering branches never re-conflict. Config one-liner (repo-admin, needs explicit `go`):
   ```bash
   gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection \
     --method PUT --input scripts/merge-queue-protection.json
   ```
9. **Attribution & Telemetry**: Attach agent labels (`agent:copilot`, `agent:<primary>`) and cycle-time metadata.

---

## 4. Hermes Mobile Specific Rules

- **Fresh-User Onboarding Mindset**: Treat every test as a brand-new user (no saved profiles, release build).
- **Expo SDK Pins Are Law**: `react-native`, `react`, and `expo*` dependencies must move only via `npx expo install --fix`.
- **Maestro E2E Input Protocol**: Chat input testing must use ONLY `"make money today"`.

---

## 5. Security & Credentials

- Never inline, print, or commit API keys, PATs, or secrets.
- Use macOS Keychain / local authenticated stores (`gh auth status`).
