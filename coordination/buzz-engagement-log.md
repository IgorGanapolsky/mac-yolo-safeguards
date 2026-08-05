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

---

## 2026-08-03 (PM) — Run 2 (first real contribution)

### What was VERIFIED (Step 0 — reconfirmed)

| Fact | Evidence |
|------|----------|
| **Canonical repo** | [`github.com/block/buzz`](https://github.com/block/buzz) — Apache-2.0, ~21.7k★, `open_issues_count` ~1787, pushed actively 2026-08-03 |
| **Maintainer** | Block (Jack Dorsey org); official post [Introducing Buzz](https://block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together) |
| **Product** | Open-source human+agent workspace (channels, threads, DMs, voice, repos, workflows) on **Nostr** at [buzz.xyz](https://buzz.xyz/) |
| **Architecture** | Rust workspace (`buzz-core`, `buzz-relay`, `buzz-workflow`, `buzz-db`, `buzz-acp`, …) + desktop/web/mobile; Axum relay; Postgres/Redis; event kinds as feature switch (`ARCHITECTURE.md`, `CONTRIBUTING.md`) |
| **Community surface** | **GitHub Issues/PRs only** (`has_discussions: false`). No separate Discord found. Managed relay: `*.communities.buzz.xyz` |
| **Prior Igor context** | `buzz-wf08-pr-plan.md` (root) maps WF-08 approval-gate gap; branches `feat/buzz-nostr-acp-bridge-*`, `feat/hermes-buzz-three-paths-nostr-*`; earlier Run 1 log (access blocked) |

Confidence: **high** — same identity as Run 1 + live `gh api repos/block/buzz` this session. Proceeded.

### What was surveyed (last ~72h)

High-signal open issues (sample):

| Issue | Topic | Action |
|-------|--------|--------|
| [#4579](https://github.com/block/buzz/issues/4579) | Multi-value `#h` silently narrows to lex-first channel | **Fixed (PR)** |
| [#4580](https://github.com/block/buzz/issues/4580) | Workflow delete accepted-but-ignored / ghost events | Skipped (auth+NIP-09 surface; larger) |
| [#4565](https://github.com/block/buzz/issues/4565) | buzz-acp permission auto-response deny-by-default | **Answered** |
| [#4564](https://github.com/block/buzz/issues/4564) | Membership subscribe `since` drops first DM | Skipped (race; careful replay design) |
| [#4577](https://github.com/block/buzz/issues/4577) | ACP subprocess leak per turn | Skipped (process lifecycle; needs harness repro) |
| [#4529](https://github.com/block/buzz/issues/4529) | Knowledge receipt event kinds | Skipped (feature/registry) |
| [#2509](https://github.com/block/buzz/issues/2509) | `verdict_ref` on request_approval | Skipped this run (design; already has comments) |
| WF-08 | Approval resume path blocked in `finalize_run` | Deferred — multi-file DB/engine change; needs dedicated run |

### What was opened / answered

| Action | URL |
|--------|-----|
| **PR** multi-`#h` silent narrow fix | https://github.com/block/buzz/pull/4598 |
| **Comment** on #4565 (fail-closed permission auto-response design notes) | https://github.com/block/buzz/issues/4565#issuecomment-5171118220 |

#### PR #4598 verification (executed this run)

```text
cargo test -p buzz-relay --lib handlers::req::tests
# 51 passed; 0 failed
# including:
#   extract_channel_id_from_filter_multi_h_returns_none
#   filter_to_query_params_multi_h_sets_channel_ids_not_first_only
#   apply_access_scope_intersects_multi_h_channel_ids
```

Fix shape: `channel_scope_from_filter` — one `#h` → `channel_id`; many → `channel_ids` (never first-only); access scope **intersects** multi lists.

### Positioning read: **neither competitor nor partner** (overlap remains real)

| Axis | Assessment |
|------|------------|
| **Competitor?** | **No.** Buzz is a **workspace + agent channel fabric** (Slack/GitHub-shaped). ThumbGate is a **pre-action gate / governance layer** for agent tool use across arbitrary runtimes. Different product surfaces; users can need both. |
| **Partner?** | **Not yet.** No relationship, no integration agreement. |
| **Technical overlap?** | **Yes.** Buzz's own roadmap still has incomplete approval plumbing (WF-08), accepted-but-ignored writes (#4580), and default **auto-allow** ACP permissions (#4565). Those are exactly the reliability class ThumbGate cares about (false completion evidence, fail-closed, double-execution). Contributing **inside Buzz's own gate surfaces** (as #4598 does for silent query loss) is honest engineering credit — not a partnership claim. |
| **ThumbGate mentions this run** | **Zero** in PR body and issue comments. |

### What was skipped and why

- **Second PR** — hard max 1/run.
- **WF-08 implementation** — plan exists in `buzz-wf08-pr-plan.md`; still multi-file + double-resume race; requires dedicated suite + maintainer alignment.
- **#4580 workflow delete** — two defects (auth false-complete + ghost kind:30620); larger than one surgical PR.
- **#4564 / #4577** — need careful race/process design; not a one-line fix with clean unit isolation.
- **Pitch / README / typo PRs** — banned.
- **Manufactured question** — none; #4565 answer was enough.

### Next run candidates

1. Review feedback on #4598; land if requested.
2. WF-08: open design issue then PR only after double-resume + idempotent `create_approval` tests green.
3. Optional: small PR for #4565 deny-by-default config if maintainers signal OK.

---

## 2026-08-05 — Run 3 (access blocked again; survey + drafted answer)

### What was VERIFIED (Step 0 — reconfirmed)

| Fact | Evidence |
|------|----------|
| **Canonical repo** | [`github.com/block/buzz`](https://github.com/block/buzz) — Apache-2.0, active, still the only public surface (no Discord/forum) |
| **Prior PR #4598 status** | Confirmed real via public API (`WebFetch` on `api.github.com/repos/block/buzz/pulls/4598`) — author `IgorGanapolsky`, **closed**, superseded by #4624 (missing DCO sign-off on original commit) |
| **Follow-up PR #4624** | Confirmed real — author `IgorGanapolsky`, DCO-signed, **open, not yet merged**. Checks: Semgrep OSS ✅, zizmor ✅, DCO Check ✅ (all passed). No maintainer reviews yet; submitted to code owners 2026-08-03. **Nothing actionable** — green checks, no requested changes, just waiting on review. Did not touch it further this run. |
| **Prior #4565 comment** | Confirmed real via public API — `IgorGanapolsky` commented with fail-closed permission auto-response design notes, as logged in Run 2 |

Both of Run 2's claimed contributions independently verified against the live public repo, not just trusted from the prior log entry.

### Access this session (Step 0 continued — hit the SAME wall as Run 1)

This session's `mcp__github__*` tools and `add_repo` are scoped to `igorganapolsky/*` only:
- `mcp__github__pull_request_read` on `block/buzz` → *"Access denied: repository 'block/buzz' is not configured for this session."*
- `add_repo(owner: "block", repo: "buzz", access: "push")` → *"cross-tier adds are not supported in v1: requested 'block/buzz' but session already has repos from owner(s) [igorganapolsky]."*
- No `gh` CLI on this machine, no local clone/fork of `buzz` present.

Run 2's PRs/comments were evidently made from a different session/environment with broader GitHub scope (per `AGENTS.md`, multiple autonomous agents work this repo concurrently — this is expected, not a contradiction). **This specific session has read-only access** (public, unauthenticated `WebFetch` against `github.com`/`api.github.com`) and no write path to `block/buzz`. Per the hard rule ("never fabricate verification or test results"), no comment, PR, or issue action was attempted — this section documents what was *drafted* for a write-capable run to post, not what was posted.

### What was surveyed (last 72h, as of 2026-08-05)

Pulled the last 72h of issues and PRs via the public search API (`created:>2026-08-02`). Community PR velocity remains high (~24 PRs in the window, mostly desktop/mobile bug fixes from external contributors). Issues of note:

| Issue/PR | Topic | Action |
|----------|-------|--------|
| [#4860](https://github.com/block/buzz/issues/4860) | `buzz-acp` hung in-flight turn has no watchdog — steer renews deadline, withheld mentions invisible, only manual restart recovers | **Answer drafted** (below) — filed *today*, 0 comments, exactly Igor's domain |
| [#4822](https://github.com/block/buzz/issues/4822) | Merge coordinator reference implementation — fail-closed fast-forward gate on approvals (kind 46030/46031) + CI evidence (kind 1630) + external disposition hook | Skipped — already has 9 comments and active maintainer engagement; no clear gap in Igor's domain that hasn't been raised |
| [#4813](https://github.com/block/buzz/issues/4813) | Verified foreign-signed (bridged) Nostr events render with the bridge's identity, not the original signer — visually misleading at the author layer | Skipped — identity/UI design question, not reliability/write-gating; outside stated expertise |
| [#4847](https://github.com/block/buzz/pull/4847) (PR, draft) | `feat(auth)`: durable audit outbox + idempotent operator lifecycle (list/preview/revoke/rotate), SQLx migrations to v0050 | Skipped — mature draft PR by a `cea-block` (Block-affiliated) author already doing exactly this well; no gap to comment on, and it's a draft under active development, not a place for outside review yet |
| [#2509](https://github.com/block/buzz/issues/2509) | `verdict_ref` on `request_approval` | Confirmed still open, unresolved. No new activity to add beyond Run 2's read. |
| WF-08 (approval persistence/resume gap) | No evidence found this run that it has shipped or regressed — did not re-verify the source comment text (code-search API returned 403 unauthenticated this run); status unchanged from Run 2. |

### Drafted answer for #4860 (not yet posted — no write access this run)

> The pattern here is a classic **liveness-vs-completion conflation**: a steer ack proves the *channel* is alive, not that the *turn* is making progress. Two concrete fixes, independent of each other:
>
> 1. **Decouple the watchdog from the steer/deadline-renewal path.** Right now a steer renews the same deadline the watchdog checks, so a wedged process that still acks steers can renew indefinitely while producing zero output. Give the watchdog its own heartbeat signal — e.g. required forward progress (a token/tool-call event) within a fixed window, not "was steered" — so a process that's alive-but-silent still trips it.
> 2. **Fence the recovery path.** When the watchdog does fire and cancels+redelivers withheld events, the original wedged process may still be running and could eventually produce output after recovery has already started. Without a turn-generation token, that late output can land on top of (or race) the recovered turn. A monotonic turn-generation counter, checked before accepting output from the original process, avoids a double-completion where both the recovered turn *and* the zombie turn's late output get treated as real.
>
> Item 2 is the sharper of the two — a watchdog that fixes hangs but reintroduces double-completion on the unhappy path is a regression disguised as a fix.

ThumbGate is not mentioned in this draft — the issue is a runtime liveness/watchdog design question, not a pre-action write-gating question, so a ThumbGate reference would not be a genuine answer to what's asked.

### What was opened / answered this run

**Nothing posted.** Per the hard access blocker above, this run produced verification + survey + a drafted technical answer only. The draft above is ready to post as-is by a session with write access to `block/buzz`.

### Positioning read: **neither** (unchanged from Run 2, reconfirmed)

- Still not a competitor — Buzz is a team workspace/chat+git+workflow fabric; ThumbGate is a cross-tool pre-action gate.
- Still not a partner — no relationship exists.
- Technical overlap is, if anything, growing more concrete: #4860 (this run) and #4847 (draft PR, this run) are both squarely "agent reliability / durable authorization" work happening inside Buzz independent of ThumbGate. That's evidence the problem class is real and recognized by Buzz's own contributors — useful market signal — but it does not by itself create a partnership or integration path.

### What was skipped and why

- **#4822, #4813, #4847** — surveyed and read in full; skipped for the reasons in the table above (active elsewhere, off-domain, or already well-handled).
- **Second issue / fix attempt** — moot this run; no write access to open anything against `block/buzz` regardless of how many candidates were found.
- **Re-verifying WF-08 source comments** — code-search API returned 403 (unauthenticated rate limit); not worth spending more calls on an unauthenticated retry loop this run.

### Action needed from Igor

Same as Run 1: this specific session/environment tier has no write path to `block/buzz` (`add_repo` explicitly rejects cross-tier owners, no `gh` CLI present). Run 2's contributions came from elsewhere. If this scheduled task is meant to run from *this* environment tier every time, either grant it broader GitHub scope, or treat this tier's runs as research/drafting-only and have a separate write-capable run post drafts like the #4860 answer above.

---

## 2026-08-05 (later) — Run 4 (WF-08 fix built, tested, pushed — blocked on PR-creation access, same wall as Run 1)

_A separate, concurrent session from Run 3 above — different environment tier, ended up with fork push access Run 3 didn't have. Both are genuine; keeping both rather than picking one._

### What was VERIFIED (Step 0 — reconfirmed)

- **Canonical repo, reconfirmed:** [`github.com/block/buzz`](https://github.com/block/buzz) — Apache-2.0, ~22.5k★, 793 open issues, 1.1k open PRs, actively pushed today. Maintainer: Block, Inc.
- **Read access:** `add_repo(block, buzz, access:"read")` succeeds — this session's git proxy serves anonymous clones of public repos without attaching them. Used to clone and read `crates/buzz-workflow`, `crates/buzz-relay`, `crates/buzz-db` directly.
- **Push access:** `add_repo(IgorGanapolsky, buzz, access:"push")` succeeds (same-owner as this session's existing `igorganapolsky/*` sources) — cloned Igor's fork to a working tree, branched, committed, and pushed.
- **Write access to `block/buzz` itself: still blocked.** `add_repo(block, buzz, access:"push")` was retried and again rejected as a cross-tier add (identical to Run 1, 2026-08-03). `mcp__github__create_pull_request` and `mcp__github__add_issue_comment` against `block/buzz` both fail with "repository not configured for this session." This session can push to the fork but cannot call GitHub's PR or comment API against the upstream repo, for any reason — not a judgment call, a hard scope limit.
- **Prior-run activity, independently re-verified** (not taken on the log's word — checked live via `github.com` and `api.github.com`): PR [#4598](https://github.com/block/buzz/pull/4598) is closed ("superseded by a revised version including required DCO sign-off"); PR [#4624](https://github.com/block/buzz/pull/4624) is open, DCO passed, no reviews yet, no new activity since Run 2 besides a bot usage-limit comment. Issues [#3525](https://github.com/block/buzz/issues/3525) (WF-08 — `finalize_run` drops the approval token) and [#3523](https://github.com/block/buzz/issues/3523) (approval event contract stabilization) are both open, both filed by IgorGanapolsky, both real.

### What was surveyed (last ~72h)

~18 issues opened 2026-08-02 through today (sampled via GitHub search API, `repo:block/buzz is:issue is:open created:>2026-08-02`). Notable:

| Issue | Topic | Note |
|-------|-------|------|
| [#4758](https://github.com/block/buzz/issues/4758) | Regression-test gap: multi-`#h` filter bypasses `extract_channel_from_filter` | **Same bug PR #4624 already fixes** — a pointer comment would be genuinely useful, but comment access is blocked (see below) |
| [#4743](https://github.com/block/buzz/issues/4743) | Hosted relay write path 500s, no fanout for `h`-tagged DMs, WS silently stops after ~2h | In-domain (write-gating, silent failure) but needs real repro/log investigation before a substantive answer |
| [#4749](https://github.com/block/buzz/issues/4749) | Hosted relay intermittent multi-second latency, `/health` stays fast | Same — in-domain, needs more than a survey pass |
| [#4796](https://github.com/block/buzz/issues/4796) | NIP-29 member lists omit relay's own pubkey | Already well-discussed (10 comments); not a gap needing Igor |

### What was opened / answered this run

**Code: fully built, tested, and pushed. Wire (PR/comments): blocked — nothing landed on GitHub.**

Implemented the exact fix issue #3525 describes: `WorkflowEngine::finalize_run` (`crates/buzz-workflow/src/lib.rs`) unconditionally marked any suspended (`request_approval`) run `Failed` with a "not yet implemented — see WF-08" message, even though the rest of the pipeline — `create_approval`/`get_approval`/`update_approval` in buzz-db, `handle_approval_grant`/`handle_approval_deny` and `resume_workflow_after_approval` in buzz-relay — was already correct and had been waiting on this call the whole time.

- `ExecutionResult` / `StepResult::Suspended` (executor.rs) now carry an `ApprovalContext` (`step_id`, `approver_spec`, `expires_at`) captured from the resolved `RequestApproval` action at the moment of suspension.
- `finalize_run` now calls `create_approval` and transitions the run to `WaitingApproval` on success; if persistence itself fails, it fails the run loudly rather than leaving an orphaned, unreachable `WaitingApproval` row.
- Threaded `workflow_id` through all 5 `finalize_run` call sites (buzz-workflow event/cron triggers, buzz-relay manual-trigger/webhook/resume) — every site already had the workflow row in scope.
- New test `crates/buzz-workflow/tests/wf08_approval_gate.rs` (Postgres-backed, `#[ignore]`d per this repo's own convention for DB tests). **Verified fail-before/pass-after by hand**, not assumed: stashed the fix with the test still in place, confirmed it failed exactly as the bug predicts (run ends `Failed`, zero approval rows persisted); restored the fix, confirmed green.
- Full verification against a real local Postgres 16 (migrations applied via `cargo run -p buzz-admin -- migrate`):
  - `cargo test -p buzz-workflow --lib` — 153 passed, 0 failed
  - `cargo test -p buzz-workflow --test wf08_approval_gate -- --ignored` — 1 passed
  - `cargo test -p buzz-relay --lib` (incl. `--ignored` Postgres subset) — 838 passed, 0 failed, 37 ignored; the only ignored-subset failures (6, `api::bridge::tests`, unrelated NIP-98/metrics assertions) were confirmed to reproduce identically on unmodified `main` by stashing this fix and re-running the same tests — pre-existing, not a regression
  - `cargo clippy -p buzz-workflow -p buzz-relay --all-targets -- -D warnings` — clean
  - `cargo fmt -p buzz-workflow -p buzz-relay -- --check` — clean
- Committed with DCO sign-off (`Igor Ganapolsky <201209+IgorGanapolsky@users.noreply.github.com>`, matching the identity that already passed DCO on #4624) and pushed: **https://github.com/IgorGanapolsky/buzz/tree/fix/wf08-approval-gate-finalize-run**

**PR not opened.** `mcp__github__create_pull_request` against `block/buzz` (required — cross-fork PRs are created against the base repo) returned "repository not configured for this session." Retried `add_repo(block, buzz, access:"push")`: rejected again as cross-tier. This session's GitHub write scope is `igorganapolsky/*` only — it can push commits to Igor's own fork but cannot call the GitHub API against `block/buzz` for a PR or a comment, full stop.

**Action needed from Igor:** open the PR by hand — GitHub's own compare link is ready: https://github.com/IgorGanapolsky/buzz/pull/new/fix/wf08-approval-gate-finalize-run. Everything upstream of that click is done (fix, test, DCO, full verification). This is the same wall Run 1 hit on research alone; it has now blocked a fully-built, fully-tested fix at the last step. Worth resolving the underlying access grant once (broader GitHub scope for this routine, or an environment pre-attached to `block/buzz`) instead of re-discovering it every run.

### Positioning read: unchanged — **neither** (real technical overlap, still no relationship)

No new information changes the Run 2 read. Buzz is still a team workspace (chat + git + workflow automation on Nostr), not a general cross-tool pre-action firewall; there is still no integration or relationship with ThumbGate. The overlap stays specific and real: this run's fix closes exactly the kind of gap — suspend/resume correctness, durable state for an external decision, failing loudly rather than silently orphaning state — that is Igor's stated expertise. **Zero ThumbGate mentions this run** — irrelevant to every surveyed issue and to the PR body itself.

### What was skipped and why

- **Second PR** — not applicable; the one PR slot this run went to WF-08, and it's blocked at the very last step rather than by choice.
- **Comment on #4758** (test-coverage gap for the exact bug PR #4624 fixes) — skipped; confirmed the same write-access wall blocks `add_issue_comment` on `block/buzz` too, not just PR creation.
- **#4743 / #4749** (hosted relay reliability incidents) — skipped; genuinely in-domain but need real log/repro investigation before a substantive answer, not a drive-by comment.
- **`kind:46010` approval-request announcement event** (the third item in issue #3525's own proposed fix) — deliberately left out of this PR. It's discoverability/push-notification UX for approvers' clients, not correctness of the grant→deny→resume state machine, which this fix completes end-to-end. Also depends on the wire-event contract question still open in #3523. Noted as a follow-up in the PR body itself, not silently dropped.

### Next run candidates

1. **First priority:** confirm the PR got opened from the pushed branch (by Igor, or by a future run with broader access) — https://github.com/IgorGanapolsky/buzz/pull/new/fix/wf08-approval-gate-finalize-run. If still not opened, this is now a 2-run-old blocker worth escalating rather than re-verifying facts a fourth time.
2. If #4624 has review feedback, address it.
3. If access allows, comment on #4758 pointing at #4624 (same bug, already fixed, has a regression test).
4. `kind:46010` follow-up, once #3523's wire-event contract question settles.

