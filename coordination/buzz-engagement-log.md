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

## 2026-08-04 — Run 3 (access blocker recurs; standing PR monitored read-only)

### What was VERIFIED (Step 0 — reconfirmed)

Re-fetched `github.com/block/buzz` directly (public, unauthenticated):
Apache-2.0, self-hostable Nostr-relay-based workspace for humans + AI agents
("channels, threads, DMs, canvases, media, search, audit log" + workflows +
git integration), Rust workspace backend / TypeScript-React + Tauri desktop
+ Flutter mobile, Postgres + Redis + S3/MinIO. **22.4k★, 2.5k forks, 777
open issues, 1.1k open PRs, 2,101 commits on main** — still highly active,
matches Run 1/2 findings exactly. No new canonical-repo ambiguity. Proceeded.

### Access status this run (the actual finding)

This scheduled session (mac-yolo-safeguards CCR environment) has **no write
path to `block/buzz`**, reproducing Run 1's blocker exactly:

- `mcp__github__pull_request_read` on `block/buzz` → *"Access denied:
  repository block/buzz is not configured for this session. Allowed
  repositories: igorganapolsky/mac-yolo-safeguards."*
- `add_repo(owner="block", repo="buzz")` → *"cross-tier adds are not
  supported in v1... session already has repos from owner(s)
  [igorganapolsky]."*
- `search_repositories(user:IgorGanapolsky buzz)` → 0 results — **no
  `igorganapolsky/buzz` fork exists** to add as a same-owner repo either.
- `gh` CLI: not installed in this container (`gh: command not found`).

Run 2's PR (#4598) and issue comment on #4565 were made from a session/
environment with real write access to `block/buzz` — not this one. That
access is not reproducible here. This is a recurring environment-config
gap, not a per-run judgment call: **flagging again, as Run 1 did**, rather
than inventing a workaround.

### What was surveyed (read-only, public web — this part works fine)

- **PR #4624** (Igor's DCO-signed rewrite of the #4579 fix, superseding the
  closed #4598): still **open**, `Block DCO Check` passing, other CI checks
  (`CI`, `Docker image`, `Desktop Release Candidate`, `Semgrep OSS`,
  `zizmor`) not conclusively readable via unauthenticated fetch, **zero
  reviews submitted** since it opened 2026-08-03. Nothing actionable from
  this session even if there were — no write path.
- **Issue #4565** (Igor's prior deny-by-default ACP permission comment):
  comment thread did not render via unauthenticated `WebFetch` (GitHub's
  dynamic loading). Could not confirm or deny a maintainer reply — noting
  as unverified rather than assuming silence either way.
- **New issues opened in the last ~72h** (sample, by creation date):
  [#4743](https://github.com/block/buzz/issues/4743) accepted DM events
  silently not fanned out / WS subscriptions silently stop delivering,
  [#4739](https://github.com/block/buzz/issues/4739) DM channels can never
  be renamed (no principal ever holds owner/admin),
  [#4736](https://github.com/block/buzz/issues/4736) delete-message breaks
  channel state until restart,
  [#4730](https://github.com/block/buzz/issues/4730) agent shows "online"
  with a live Shutdown button after it has actually shut down,
  [#4728](https://github.com/block/buzz/issues/4728) buzz-acp advertises
  `protocolVersion: 2` but implements v1 semantics,
  [#4720](https://github.com/block/buzz/issues/4720) CI hardcodes
  `ghcr.io/block`, breaking docker workflows on every fork,
  [#4712](https://github.com/block/buzz/issues/4712)
  `git-credential-nostr` silently ignores `BUZZ_PRIVATE_KEY`.

  Of these, **#4743** (write accepted, then silently lost) and **#4730**
  (stale self-reported status contradicting real state) sit squarely in
  Igor's domain — false completion evidence, write-gating, verification-
  vs-self-report. #4712 is a silent-failure/fail-closed case. #4720 is a
  small, self-contained, testable fix (hardcoded registry string) that
  would make a clean "at most one fix" candidate once access exists.

### What was opened / answered this run

**Nothing.** No write path (see Access status above). No fabricated PR,
comment, or test result — per the hard rule against fabricating
verification.

### Positioning read: **neither competitor nor partner** (unchanged, freshly evidenced)

Same read as Run 2. #4743 and #4730 are new, concrete instances of the
same reliability class ThumbGate addresses (writes silently accepted but
not delivered/verified; status that self-reports "fine" while reality
diverges) — reinforcing that the technical overlap is real without making
Buzz a competitor (it's a workspace/channel fabric, not a cross-tool
pre-action gate) or a partner (still no relationship). **Zero** ThumbGate
mentions this run — no question arose that warranted one.

### What was skipped and why

- **Commenting on #4743 / #4730 / #4712 / #4720 / #4728** — skipped: no
  write access this run.
- **New PR** — skipped: no write access; also moot, since #4624 is already
  this line of work's one fix in flight and awaiting review — a second PR
  would exceed the 1-PR/run cap regardless of access.
- **WF-08 implementation** — still deferred; needs a dedicated run with
  write access and the full `buzz-workflow` test suite.
- **Chasing down #4565's comment thread further** — skipped rather than
  guessing at content the fetch tool couldn't render.

### Action needed from Igor

Same root cause as Run 1, now confirmed twice: **this specific scheduled
session/environment cannot write to `block/buzz`** — GitHub MCP scope is
locked to `igorganapolsky/mac-yolo-safeguards`, `add_repo` refuses
cross-tier adds, no `igorganapolsky/buzz` fork exists to add same-owner,
and there's no `gh` CLI in the container. Run 2's actual PR/comment came
from a different session that *did* have that access. Pick one:

1. Add a persistent `igorganapolsky/buzz` fork this environment can reach
   via `add_repo` (same-owner add would then work), or
2. Widen this environment's GitHub scope to include `block/buzz`, or
3. Point this Routine at the environment/session Run 2 actually used for
   the write steps, and let this one stay research/log-only.

Separately, independent of access: **PR #4624 has had zero reviewers in
~24h** — worth a manual nudge or comment from Igor if he wants it moving.

### Next run candidates

1. Check PR #4624 for review feedback; respond/fix if requested (needs
   write access).
2. #4743 (accepted-but-lost DM writes) — closest to Igor's domain, worth a
   careful look once access exists.
3. #4720 (hardcoded `ghcr.io/block` breaking forks) — small, self-
   contained, good candidate for the next "at most one fix" once access
   exists.

