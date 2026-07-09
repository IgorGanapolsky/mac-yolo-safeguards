# REPLIT-AGENT-COORDINATION.md — Operating protocol for the Replit cloud agent

Canonical protocol for the **Replit agent** (`agent-id: replit`) contributing to this repo.
Pairs with [`AGENTS.md`](./AGENTS.md) (shared multi-agent directive) and [`plan.md`](./plan.md)
(the live claim board). The handoff router (`.github/workflows/handoff.yml`) links here.

---

## 0. Who / what the Replit agent is

- A **cloud** coding agent running in a Replit container. Its only outbound reach is **public HTTPS**.
  It cannot reach the private Obsidian vault, the Mac gateway / tailnet, or any LAN host.
- Therefore **GitHub is the only shared coordination bus** between the Replit agent and the local
  agents (Claude Code, Cursor, …). All handoffs happen through GitHub: branches, PRs, issues,
  labels, and `plan.md`.
- The Replit **workspace is a pnpm monorepo** (`artifacts/hermes-mobile`, `artifacts/api-server`,
  `artifacts/mockup-sandbox`) used for dev/preview only. **It is NOT the source of truth and never
  ships.** Production Hermes Mobile ships from *this* repo's `hermes-mobile/` (OTA via
  `.github/workflows/mobile-ota.yml`). Anything the Replit agent wants shipped must land here as a PR.

## 1. How the Replit agent "connects" to this repo

A cloud agent connects to this repo **over GitHub**, not by attaching the Replit workspace to it.
Because the Replit workspace tree (a pnpm monorepo) is structurally different from this repo's root
layout, the Replit agent does **not** repoint the Replit "Git pane" / repl `origin` at this repo —
that would try to reconcile two incompatible trees and overwrite/diverge this repo. Instead it works
on a **clone**:

- Clone lives **outside** the Replit workspace (e.g. `/home/runner/mac-yolo-safeguards`); it is
  ephemeral, so **clone/pull every session**.
- Auth with the `gh` / `git` CLI + Igor's `GITHUB_PERSONAL_ACCESS_TOKEN`
  (`export GH_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN"` at the top of each git-op shell).
- Do **not** use Replit's git-remote skill callbacks — they target the repl's internal backup
  remote, not this GitHub repo.

Net effect: the Replit agent is a first-class contributor whose work shows up as `replit/*` branches
and PRs, right alongside the local agents.

## 2. Per-session protocol (every task)

1. `git pull` (or re-clone) so you are on latest `main`.
2. Read [`AGENTS.md`](./AGENTS.md) and [`plan.md`](./plan.md) — §1 Task Board + §2 File Ownership Map.
3. **Claim before you touch:** pick or add a §1 task row (Owner = `replit`, Status = `in_progress`)
   **and** add your files to §2 (`… → replit (T-NN …) (UTC date)`). **Commit `plan.md` first**,
   before editing any code.
4. Work on a **`replit/*` branch** (e.g. `replit/<task-slug>`).
5. Open a **draft PR early** — the handoff router announces it so other agents keep off your files
   mid-flight (anti-divergence).
6. Verify in the same turn: `npm test` (+ the Maestro gate
   `hermes-mobile/docs/proofs/continuous/latest.json` for any change under `hermes-mobile/src`,
   `app.json`, or `.maestro/`).
7. When green: mark the PR ready + label `status:review`; set the §1 row `done`; release your §2
   files (append a line); add a §3 Decisions-Log entry.

## 3. Hard rules (the "never" list)

- **Never merge `main`.** The Replit agent only opens PRs; a human (Igor) or the merge gate merges.
- **Never edit a file another agent owns** in `plan.md` §2. If you need it → mark your task
  `blocked`, log it in §3, and **STOP**. No workarounds, no deleting their claim / branch / WIP.
- **Never force-push a shared branch**; never rewrite another agent's branch.
- **Never write secrets** to tracked files (PATs, keys, tokens). Authenticate only via env.
- **Never add a second OTA / EAS pipeline** — OTA already ships from
  `.github/workflows/mobile-ota.yml`.
- Logs in `plan.md` (§3 Decisions, §4 Discovered) are **append-only**.
- Respect the concurrency cap (2–3 active agents). If the files you need are hot or owned,
  coordinate or wait — do not diverge.

## 4. Identity + handoff bus

> **Status (2026-07-09):** the handoff router (`.github/workflows/handoff.yml`) ships with PR #79 (`ci/agent-handoff-router`) and is **not yet on `main`**. Until it merges, treat label routing and the draft-PR announcement as **manual** — state handoffs explicitly in the PR/issue body. The `plan.md` §2 claim board is the source of truth for file ownership regardless of the router.

- **agent-id:** `replit` (used in `plan.md` claims) · **branch prefix:** `replit/*` ·
  **handoff label:** `handoff:replit`.
- Labels are routed by `.github/workflows/handoff.yml`:
  - `handoff:replit` → work handed to the Replit agent (pull, claim in §2, `replit/*` branch,
    draft PR, never merge main).
  - `handoff:claude` → handed to Claude Code (local).
  - `status:review` → ready for human review; CI must be green before merge.
  - A newly-opened **draft PR** is auto-announced: "work visible mid-flight — other agents keep off
    these files."

## 5. What NOT to build (decided — do not relitigate)

Evaluated and rejected; a cloud agent + the GitHub bus makes these redundant or actively harmful:

- ❌ Vault → Replit sync (fights the trust boundary; the vault is not cloud-reachable).
- ❌ A separate "dev-mirror" repo as source of truth (guarantees divergence).
- ❌ Exposing the Mac gateway publicly.
- ❌ Zapier / Make or any custom "agent-mesh" relay server (the mobile-relay saga already taught
  this lesson).

Allowed enhancements, only with a concrete trigger:

- GitHub's hosted (remote) **MCP server**, so both the Replit agent and Claude Code share one
  machine-readable tool surface over issues/PRs (needs a scoped token; verify GitHub's current
  remote-MCP endpoint before wiring).
- The handoff Action (`.github/workflows/handoff.yml`).
