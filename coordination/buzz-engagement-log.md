# Buzz Engagement Log

Autonomous log of Igor Ganapolsky's engagement with Jack Dorsey / Block's
"Buzz" project (`github.com/block/buzz`) and honest ThumbGate positioning
against it. Append-only, most recent entry last.

---

## 2026-08-03 — Run 1 (identity verification + access blocker)

### What was VERIFIED (Step 0)

- **Canonical repo:** [`github.com/block/buzz`](https://github.com/block/buzz)
  — "A hive mind communication platform." Confirmed via web search and by
  cloning it directly (`git clone https://github.com/block/buzz.git`
  succeeded anonymously — it's a large, very active public repo).
- **What it is:** Block (Jack Dorsey) launched Buzz on 2026-07-21 as an
  open-source, self-hosted workspace where humans and AI agents share the
  same channels/threads/DMs/voice/git-repos/workflow-automation, positioned
  as a replacement for Slack + GitHub. Apache 2.0. Sources:
  [TechCrunch](https://techcrunch.com/2026/07/21/jack-dorsey-is-taking-on-slack-with-buzz-a-group-chat-platform-for-teams-and-their-ai-agents/),
  [Decrypt](https://decrypt.co/374026/jack-dorseys-block-launches-buzz-a-nostr-based-slack-and-github-rival-for-ai-agents),
  [Block's own announcement](https://block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together).
- **Architecture:** Rust workspace (`buzz-core`, `buzz-workflow`, `buzz-auth`,
  `buzz-db`, `buzz-pubsub`, `buzz-search`, `buzz-audit`), single Axum binary
  serving WebSocket relay + REST + web UI, Postgres + Redis + S3/MinIO.
  Built on the Nostr protocol (NIP-01/29/42/98) — every message, workflow
  step, git event, and approval is a cryptographically signed, hash-chained
  event. Confirmed by reading `ARCHITECTURE.md`, `AGENTS.md`, and
  `crates/buzz-workflow/src/{lib,executor,schema}.rs` in the cloned repo.
- **Community/discussion surface:** No separate Discord/forum found in
  README — issues and PRs on `block/buzz` itself are the primary public
  surface. There's a `communities.buzz.xyz` managed relay offering, and the
  repo functions as its own dogfooded Buzz community per `README.md`.
- **Prior context in this repo:** No `buzz-wf08-pr-plan.md` file exists
  anywhere in git history or on any branch (checked `git log --all
  --diff-filter=A --name-only` and all remote branches). However, two
  branches (`feat/buzz-nostr-acp-bridge-and-agent-identity-20260728`,
  `feat/buzz-p0-shared-room-ux`) and `packages/hermes-protocol/src/
  buzz-approval.js` show a prior agent already built a signed Nostr
  approval-adapter (`BUZZ_APPROVAL_REQUEST_KIND = 46010`, `GRANT_KIND =
  46030`, `DENY_KIND = 46031`, replay guard, decision guard, expiry) — this
  lines up **exactly** with Buzz's own unimplemented `WF-08` approval gate
  (see below). That's very likely what the missing plan file referred to.

### What was surveyed (last 72h, as of 2026-08-03)

Block's own engineers are extremely active on this repo (dozens of PRs/day
from `@block.xyz`-affiliated authors). Surveyed via the public issues/PRs
list (read-only, unauthenticated):

- **#4563** — text-only model image rejection poisons the managed-agent
  channel queue (reproducible, has a linked PR #4566 already).
- **#4561 / #4538** — managed relay (`communities.buzz.xyz`, v0.2.0) missing
  the `/query` endpoint the v0.5.3 desktop agent expects → 404, agent
  harness exits 1. Reproducible version-skew bug.
- **#2515** — agents from different communities collide in the same
  channel (duplicate @mention targets, broken avatars) — an identity/
  namespacing bug.
- **#2509** — proposal for an optional `verdict_ref` (content-addressed,
  independently-checkable claim) on the `request_approval` workflow action.
  Directly adjacent to verification-vs-self-report.
- **`WF-08`** (not a numbered issue, referenced in code comments/TODOs in
  `crates/buzz-workflow/src/{lib,executor}.rs`): the `request_approval`
  workflow action generates a token and returns `Suspended`, but the engine
  "does not yet persist the token or resume execution — runs that hit an
  approval gate are marked as failed." This is a real, acknowledged gap in
  exactly Igor's domain: write-gating, approval persistence, and resuming
  execution after an external decision (leases/fencing-token territory).

### What was opened / answered this run

**Nothing.** No PR opened, no issue answered, no comment posted.

**Why:** this session's GitHub access (`mcp__github__*` tools and
`add_repo`) is scoped to `igorganapolsky/*` repositories only.
`add_repo("block", "buzz")` was attempted and explicitly rejected:
*"cross-tier adds are not supported in v1: requested block/buzz but session
already has repos from owner(s) [igorganapolsky]."* Buzz's own
`CONTRIBUTING.md` requires external contributors to fork `block/buzz` and
open a PR from the fork — that requires an authenticated GitHub identity
with push access to a fork under Igor's account, which this environment
does not have for any account other than `igorganapolsky` against
`igorganapolsky`-owned repos. A read-only anonymous `git clone` of the
public repo succeeded and was used for research, but no write path (fork,
push, PR, issue comment) is available from this session.

This is a **hard environment limitation, not a judgment call** — per the
run's own hard rules ("never fabricate verification or test results"), no
fix, test, PR, or comment was attempted or claimed.

### Positioning read: **neither** (real technical overlap, no relationship yet)

- Buzz is **not a competitor** to ThumbGate in the product sense — it's a
  team workspace (chat + git + workflow automation), not a general
  cross-tool pre-action firewall for arbitrary agent actions (shell, file
  writes, deploys) across whatever tools an agent already uses.
- Buzz is **not currently a partner** either — there is no integration,
  no contact, no agreement.
- There **is** a genuine, concrete point of overlap: Buzz's `request_approval`
  workflow action is explicitly incomplete (`WF-08` — no persistence, no
  resume-after-decision), and it is designed to emit Nostr kind:46010/
  46030/46031 events for request/grant/deny — which is precisely what
  `packages/hermes-protocol/src/buzz-approval.js` in this repo already
  implements client-side (signed events, replay guard, decision guard,
  expiry/lifetime enforcement). If that code is correct and compatible,
  it's a real candidate contribution to Buzz's own approval-gate gap, not
  a ThumbGate pitch — it would just be Igor fixing a documented bug in an
  open-source project using skills he has. Whether it *becomes* a partner
  relationship depends on whether Block wants outside contributions to
  `buzz-workflow`'s approval engine, which is unknown and not something to
  assume.
- Recommendation for next run (once access exists): verify
  `buzz-approval.js`'s Nostr event shape against `crates/buzz-workflow`'s
  actual tag/kind expectations line-by-line before attempting any PR — do
  not assume the two were built compatible just because the kind numbers
  match.

### What was skipped and why

- **Answering issues/questions:** skipped — no write access this run (see
  above). Candidates for a future run once access is granted: #4561/#4538
  (relay version-skew, reproducible, answerable without a fix), #2509
  (verdict_ref proposal — directly in Igor's domain, could add a
  substantive design comment).
- **Picking a fix + test:** skipped — could not even open a PR if a fix
  were written, so no fix was attempted this run to avoid wasted work.
- **WF-08 implementation:** deliberately not attempted this run — it's a
  multi-file, DB-schema-touching change to someone else's production
  workflow engine; per the hard rule ("pick at most one issue you can
  genuinely fix... open a PR only if tests pass"), this needs its own
  dedicated, access-enabled run with real test-suite verification, not a
  rushed attempt blocked on infrastructure.

### Action needed from Igor

This session cannot proceed past research until one of:
1. This environment/session is given GitHub scope (or `add_repo`) for a
   fork of `block/buzz` under an account that can push, or
2. Igor runs the next iteration from a session/environment that already
   has broader GitHub access.

Until then, future scheduled runs of this task will keep re-verifying the
same facts and hitting the same wall — worth fixing the access grant once
rather than re-discovering it every 72h.
