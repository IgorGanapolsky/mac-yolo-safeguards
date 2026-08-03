# Build a Safe Linear-Obsidian Agent Fleet

## Executive Summary

- **Two Ledgers, One Code Truth**: Linear documents GraphQL issue updates, labels, comments, assignees, workflow states, and webhooks, while Obsidian stores a local folder synced across devices -> use Linear for durable coordination, Obsidian for readable WIP and handoffs, and Git for authoritative code history. [41] [87] [60]
- **Leases Beat Permanent Locks**: Linear's public schema exposes fields such as `assigneeId`, `stateId`, `labelIds`, `addedLabelIds`, and `removedLabelIds`, but the researched schema does not document an atomic compare-and-set claim -> implement a renewable, observable claim lease and use worktrees or a transactional broker when exclusivity matters. [83] [55]
- **Stigmergic Coordination**: Stigmergy coordinates agents indirectly through traces left in a shared medium; a **2025** blackboard-architecture paper proposes selecting agents from the current shared state and repeating rounds until consensus -> make every Linear comment and Obsidian handoff a structured, discoverable trace rather than private chat history. [34] [111]
- **Crash Recovery Is Normal**: Amazon SQS makes work temporarily invisible through a visibility timeout and exposes it again when a consumer crashes without deleting it; Linear webhooks may retry at approximately **1 minute, 1 hour, and 6 hours** -> design claim expiry, webhook deduplication, and reconciliation from the beginning. [132] [37]
- **Human-On-the-Loop, Not Human-Absent**: NIST calls for continuous monitoring and fallback, while 2026 industry guidance separates approval-before-action for high-risk work from monitoring-and-intervention for reversible work -> keep humans in the approval path for secrets, destructive commands, merges, releases, and production changes. [117] Human-in-the-Loop: A 2026 Guide
- **Isolation and Visibility Are Complementary**: Git worktrees separate per-worktree `HEAD` and index while sharing repository data, and Cursor and Claude support isolated parallel sessions -> run each code-writing agent in its own worktree while sharing Linear and Obsidian for coordination. [60] [24] [61]
- **Linear Is Now an Agent-Ops Surface**: Linear announced Linear Agent public beta on **March 24, 2026**, describes agents as app users that can be assigned and mentioned, and promotes API-built agents and MCP connections to tools including Claude and Cursor -> treat the issue activity stream as an agent-visible operating record, not just a backlog. [13] [46] [45]
- **Standardize the Boundary, Not the Model**: Claude has separate teammate contexts and task coordination, Codex runs locally with approval and sandbox controls, Cursor creates isolated worktrees, Grok Build supports interactive, headless, and ACP modes, and Hermes supplies a local TUI and persistent skills -> give every adapter the same claim, heartbeat, handoff, and exit contract. [59] [26] [142] [126]

## 1. Linear's GraphQL Primitives Make a Good Durable Ledger

Linear's public API is GraphQL at `https://api.linear.app/graphql`. The documented authentication choices are personal API keys for scripts and OAuth2 bearer tokens for applications used by others. The API supports schema introspection and a TypeScript SDK, which matters for a fleet because an adapter can inspect the current schema at installation time instead of relying on stale REST examples. [41]

The current public schema exposes `issueUpdate` and an `IssueUpdateInput` with fields including `assigneeId`, `stateId`, `labelIds`, `addedLabelIds`, and `removedLabelIds`. It also exposes `CommentCreateInput`; Linear's webhook documentation treats issue comments and issue labels as first-class webhook resources. Because the extracted public schema did not document a compare-and-set claim mutation, the dispatcher should introspect and pin the mutation names it uses, but should not pretend that assigning an issue is an atomic lock. [83] [101] [37]

Use Linear fields for different semantics. Use the workflow state for the lifecycle, such as `Ready`, `In Progress`, `Blocked`, `Review`, and `Done`. Use the assignee for the current responsible human or agent identity. Use labels for orthogonal metadata such as `agent-ready`, `agent-needs-human`, `area-api`, `risk-high`, and `lease-stale`. Do not encode every state transition as a label: Linear documents that a label group permits only one label from that group at a time, and label groups are limited to **250** labels. That behavior makes state a better lifecycle field and labels a better tag system. [44] [9]

### Recommended claim mutation, with an explicit non-atomic boundary

1. Read the issue by stable ID and record its current state, assignee, labels, updated timestamp, and current claim comment.
2. Refuse the claim if the issue is not in an eligible state, already has an unexpired claim, or has changed since the read.
3. Submit the smallest supported update: assign the agent identity, move the issue to `In Progress`, and add a claim label. Use `addedLabelIds` or `removedLabelIds` rather than replacing unrelated labels when the schema supports it.
4. Re-read the issue. If another agent won the race, stop work and write no code. If the result matches, append a structured comment using the current schema's comment input. The comment should contain `claim_id`, `agent_id`, `issue_id`, `lease_expires_at`, `heartbeat_at`, `worktree`, `branch`, and `risk_lane`.
5. Have a single dispatcher serialize competing claims, or put a small transactional claim service in front of Linear. Linear remains the human-visible ledger; the broker supplies compare-and-set and fencing if hard exclusivity is required.

### Case study: Linear's transition from project tool to agent surface

Linear announced Linear Agent in public beta on **March 24, 2026**. Its product material says the agent can synthesize workspace context, make recommendations, and take action. Linear's agent documentation describes agents as app users that can be mentioned, receive delegated issues through assignment, and act subject to installation permissions. [13] [46]

The decision is important for a solo founder: the issue is becoming the shared surface where humans and agents can see ownership and activity. The outcome does not remove the need for a lock service. Linear's documented primitives make ownership legible, but the researched API material does not promise an atomic claim or fencing token. The design implication is to use Linear for durable evidence and a dispatcher or worktree for exclusivity.

## 2. Obsidian Works Best as a Shared WIP Ledger Outside the Repository

Obsidian's developer documentation defines a vault as a folder and its subfolders. Obsidian Sync keeps notes synchronized across devices and provides a remote copy while local copies remain on devices; the Sync materials also describe version history and troubleshooting. That makes a vault useful for plans, decisions, run summaries, research notes, and handoffs that should be readable by a founder and by a fresh agent. [87] [106] [104]

Keep the vault outside the code repository and outside every Git worktree. A practical layout is:

```text
agent-vault/
  00-inbox/
  10-claims/
  20-handoffs/
  30-decisions/
  40-run-logs/
  50-research/
  90-archive/
```

Use one issue file per claim or handoff rather than one hot `claims.md` file that every process rewrites. Prefer append-only event files for high-churn data. A claim file can contain YAML frontmatter such as:

```yaml
issue: ENG-123
agent: agent:claude
claim_id: ENG-123-<opaque-id>
lease_expires_at: <UTC timestamp>
last_heartbeat_at: <UTC timestamp>
worktree: <absolute path>
branch: agent/ENG-123-claude
status: active
```

The body should state the scope, files expected to change, tests to run, known risks, and the next action. A handoff should state what was completed, what remains, the exact test result, the commit or uncommitted diff status, the next safe command, and whether the claim is released. This structure turns Obsidian into a human-readable memory layer rather than a second chat transcript.

Do not put the vault in the repository merely to make it visible to agents. Code artifacts, commits, and tests belong to Git. Operational context that changes during a run belongs in the vault and in Linear. If a decision changes product behavior, copy the final decision into a durable Linear comment or issue description as well, because the vault is a convenience layer and Sync is a synchronization service, not a transactional database.

### Case study: Anthropic's external-memory pattern

Anthropic describes its production multi-agent research system as an orchestrator that decomposes a question and launches specialized subagents. The subagents search and use tools, then return findings for synthesis. For long horizons, Anthropic recommends summarizing completed phases and saving essential information to external memory before spawning fresh agents with clean contexts. [33]

The mechanism maps directly to the vault. An agent should leave a compact artifact reference rather than forcing the next session to reconstruct private context. The important caveat is that Anthropic's external memory is a coordination aid, not evidence that a synchronized Markdown folder supplies atomic writes. Use the vault for continuity and legibility, and use Linear, a broker, or Git for ownership and enforcement.

## 3. Claims Need Leases, Heartbeats, and Stale-Recovery Rules

A claim is not a permanent lock. It is a time-bounded assertion that an agent currently intends to work on an issue. The minimum claim record is `claim_id`, `agent_id`, `issue_id`, `acquired_at`, `lease_expires_at`, `last_heartbeat_at`, `worktree`, `branch`, `process_id` when available, and `attempt`. The claim owner renews the lease while it is actively working and releases it when it stops.

The distributed-systems reason is fundamental. Martin Kleppmann explains that a lease can expire while an old client is paused or delayed; a new client may acquire the resource while the old client later resumes. For a lock that protects correctness, he recommends a monotonically increasing fencing token that the storage service checks on every write. A Linear label or comment cannot fence an already-running process from writing a local checkout, so a Linear-only claim is a coordination signal, not a hard mutual-exclusion guarantee. [55]

Amazon SQS provides a useful analogy, not a direct implementation prescription. Its visibility timeout makes a received message temporarily invisible to other consumers; if the consumer crashes without deleting the message, the message becomes visible again. SQS permits extending visibility, and the documented maximum is **12 hours** from the initial receipt. Standard queues have an approximate **120,000** in-flight-message limit. For an agent fleet, the equivalent is a lease expiry, explicit renewal, and reclaim after a crash. [132]

### Recommended default lease policy

Use a starting policy of a **15-minute lease**, a **5-minute heartbeat**, and a **2-heartbeat grace period** before a claim becomes stale. These are operating defaults to tune after observing real runs, not vendor requirements. Every heartbeat should update the Linear comment or a low-noise run record and refresh the Obsidian claim file. The final completion or release should update the issue state, write a handoff, and remove the active claim marker.

If a process dies, the reconciler should not immediately reassign a live-looking issue. It should re-read Linear, check the lease and latest heartbeat, inspect the local process and worktree, mark the claim `stale`, and write a recovery comment. If the worktree contains uncommitted changes, route the issue to human review or a recovery agent. If it is clean and the lease is expired, a new agent may claim it with a new `claim_id` and higher attempt number. A truly hard lock requires a broker that rejects old fencing tokens or an isolation mechanism such as separate worktrees.

## 4. Anti-Patterns That Create False Coordination

| Anti-pattern | Why it fails | Safer replacement |
|---|---|---|
| **Plugin-as-lock** | An Obsidian plugin can read and write vault files through the Vault API, but the researched Obsidian material does not document a distributed compare-and-set lock, lease fencing, or protection against a delayed process. Sync gives copies and conflict troubleshooting, not a correctness barrier. | Treat plugin state as advisory. Claim through a serialized dispatcher or transactional store, then mirror the result to Obsidian and Linear. [87] [106] [55] |
| **Assignee equals hard lock** | Linear makes ownership visible, but the public schema research did not find an atomic compare-and-set claim operation or a fencing token. Two agents can read an unassigned issue before either update wins. | Serialize claims, re-read after mutation, and use worktree or broker enforcement when duplicate edits would be dangerous. [83] |
| **Stale claims live forever** | Crashes, laptop sleep, provider timeouts, and network failures leave an owner and `In Progress` state behind. A later agent either waits forever or edits around the stale owner. | Use lease expiry, heartbeat, a reconciler, stale labels, recovery comments, and attempt numbers. The SQS visibility-timeout pattern demonstrates why work must become reclaimable after a failed consumer. [132] |
| **Mid-session claim hygiene is optional** | Scope expands, the agent changes files outside the original claim, or the session blocks while the claim remains active. The ledger then lies about scope and availability. | Renew before expensive work, update scope and risk when it changes, post a blocker immediately, release when pausing, and write a final handoff before exit. Anthropic's fresh-context guidance supports saving compact external state instead of relying on chat history. [33] |
| **One hot Markdown file** | Concurrent agents rewrite the same file, creating sync conflicts and making audit history ambiguous. | Use per-issue claim files, append-only run events, and a deterministic index generated by a daemon. Keep current state in frontmatter and history in separate entries. [106] |
| **Webhook handler does the work inline** | Linear documents failed-delivery retries at approximately **1 minute, 1 hour, and 6 hours** and may disable a repeatedly failing webhook. A slow handler can therefore duplicate or amplify work. | Verify, record, enqueue, and return HTTP **200** quickly. Deduplicate by event identity and issue revision, then let a supervisor execute the job. [37] |
| **All agents share one checkout** | A second process can overwrite or observe half-finished files, while the coordination ledger says both jobs are active. | Give each code-writing run a separate Git worktree, or enforce a single-writer file boundary. [24] [60] |
| **Human approval on every trivial step** | Approval fatigue makes the founder click through unsafe actions without reading them. | Use risk lanes: autonomous read-only and test work, monitored reversible edits, and explicit approval for secrets, destructive commands, merges, releases, and production changes. [117] Human-in-the-Loop: A 2026 Guide |

The most dangerous anti-pattern is combining several of these: an agent claims an issue by editing one shared Obsidian file, writes code in the main checkout, then crashes before a handoff. The issue remains assigned, the file may conflict during Sync, and the repository contains an unowned partial change. The hybrid protocol below breaks that chain at every boundary.

## 5. A Session-Start Protocol That Survives Fresh Contexts

Every agent, regardless of model or interface, should execute the same startup sequence. The sequence is intentionally boring: it turns the shared ledger into a protocol instead of a suggestion.

1. **Load identity and policy.** Read the adapter's agent ID, repository allowlist, risk lane, Linear credentials, vault path, and worktree root. Never infer identity from a display name or the current shell directory.
2. **Reconcile before claiming.** Query Linear for issues assigned to this agent, issues with `agent-claimed`, `agent-stale`, or `agent-needs-human`, and eligible `Ready` issues. Read the corresponding Obsidian claim and latest handoff. If a prior claim is active, resume or explicitly release it; do not silently create a second claim.
3. **Check code isolation.** Confirm the expected worktree path, branch, repository, and clean or intentionally dirty status. If the worktree belongs to another `claim_id`, stop. Claude's worktree guidance requires at least one commit for isolated worktree operation, so bootstrap the repository with a real initial commit before automating it. [61]
4. **Validate the claim.** Re-read the Linear issue immediately before mutation. Confirm state, assignee, active lease, and scope. Submit the smallest assignment/state/label update, then re-read to verify the winner. If verification fails, do not edit files.
5. **Write the start trace.** Append a Linear comment and an Obsidian claim record containing the claim ID, lease expiry, heartbeat time, worktree, branch, intended files, test command, and risk lane. The next agent should be able to start without the previous conversation.
6. **Run a cheap health check.** Run repository status, dependency or environment checks, and the narrowest relevant test or lint command. Record the result before making a broad change.
7. **Work in bounded increments.** Renew the lease before long commands, update the scope when it changes, and write a blocker immediately rather than continuing under an inaccurate claim. Do not claim another issue while the current issue has uncommitted work unless the dispatcher explicitly supports multiple leases.
8. **Exit deliberately.** On success, record tests and commit or PR references, update Linear to `Review` or `Done`, write the handoff, and release the claim. On failure, preserve the worktree, mark the issue `Blocked` or `Needs human`, explain the exact next action, and keep or release the lease according to the recovery policy.

### Handoff format

Use a stable template in both Linear and Obsidian:

```text
STATUS: implementing | blocked | review | done
CLAIM_ID: <id>
OWNER: <agent id>
SCOPE: <files and behavior>
DONE: <concrete changes>
TESTS: <commands and results>
RISKS: <known unresolved risks>
NEXT_ACTION: <one safe next action>
WORKTREE: <path>
BRANCH_OR_COMMIT: <reference>
LEASE: <expires or released>
```

This is a direct application of Anthropic's documented practice of summarizing completed phases, storing essential information externally, and spawning fresh subagents with clean contexts. It also addresses the known limitation that Claude teammates have separate context windows and do not inherit the lead's conversation history. [33] [59]

## 6. Stigmergy and Human-On-the-Loop Operations

Stigmergy is indirect coordination: an agent changes a shared environment, and the resulting trace changes what another agent does. In this fleet, the environment is the combination of Linear states, assignees, labels, comments, Obsidian claim files, handoffs, test results, and Git branches. Agents do not need a private conversation with every other agent if the traces are timely, structured, and queryable. [34]

A paper submitted on **July 2, 2025**, "Exploring Advanced LLM Multi-Agent Systems Based on Blackboard Architecture," proposes a shared blackboard in which agents share information, select actions based on current blackboard contents, and repeat rounds until consensus. The paper reports competitive results on its evaluated datasets, but it is a research proposal and not proof that an Obsidian vault or Linear workflow is safe under production file races. Use it as conceptual support for visible traces, not as a production lock guarantee. [111]

Anthropic provides a stronger production engineering analogue. Its multi-agent research system uses a lead agent, specialized parallel subagents, external artifacts, budgets, source-quality heuristics, and human evaluation. Anthropic explicitly calls out runaway spawning, endless searches for nonexistent sources, verbose or incorrect queries, and emergent behavior from small prompt changes. The implication for coding fleets is that the dispatcher must limit concurrency, budget runs, and expose observable state rather than treating more agents as automatically more output. [33]

Human oversight should be risk-based. NIST's Generative AI Profile recommends continuous monitoring of third-party GAI systems and risk management for rollover and fallback technologies, including manual processing. A 2026 Strata guide distinguishes human-in-the-loop approval before high-risk actions from human-on-the-loop monitoring and intervention for medium-risk, reversible actions; it recommends time-boxed decision lanes and post-hoc review, and warns that simply having a human present does not prevent automation complacency. [117] Human-in-the-Loop: A 2026 Guide

For a solo founder, use three lanes:

| Risk lane | Agent authority | Founder control |
|---|---|---|
| **Low** | Read code, search, run tests, update notes, draft comments, and make isolated non-destructive edits | Review the run summary and sample output |
| **Medium** | Implement within a declared worktree, modify tests, open a PR, and update Linear | Monitor heartbeats and require review before merge |
| **High** | Change secrets, permissions, billing, infrastructure, migrations, production systems, or release state | Explicit approval before execution, plus post-hoc audit |

The point is not to eliminate autonomy. It is to ensure that an agent can be fast on reversible work while the founder remains the accountable decision-maker for irreversible work.

## 7. Plan.md Plus Worktrees Versus Shared Coordination

`plan.md` and Git worktrees solve a different problem from Linear and Obsidian. A plan file gives one session a compact local narrative. A worktree gives that session a separate checkout and branch. Linear and Obsidian provide cross-session discovery, ownership, and human-readable state, but they do not by themselves isolate code writes.

| Dimension | Linear plus Obsidian | `plan.md` plus Git worktrees | Recommended hybrid |
|---|---|---|---|
| **Primary mechanism** | Shared traces: issue state, assignee, labels, comments, handoffs, and notes | Local plan plus filesystem and branch isolation | Linear task truth, Obsidian WIP, per-run `plan.md`, and worktree isolation |
| **Visibility** | High across agents and the founder | Low unless the plan is copied or linked | Put the plan link and next action in Linear and Obsidian |
| **Code safety** | Advisory only; shared files can race | Stronger separation of checkout, `HEAD`, and index | Never let two agents write the same worktree |
| **Continuity** | Good across fresh sessions if handoffs are structured | Good within one branch; weak as a fleet-wide index | Handoff in both Linear and Obsidian, plan inside the worktree |
| **Concurrency cost** | Claim races, Sync conflicts, stale state | Merge conflicts, duplicate dependencies, disk use, cleanup | Accept merge cost to prevent live write collisions |
| **Recovery** | Lease expiry and reconciliation can find abandoned work | Branch and worktree preserve partial work | Reconcile Linear claim to branch, path, and process |
| **Human review** | Excellent activity and decision surface | Excellent diff and test surface | Founder reviews Linear context, then the isolated diff |

Git documents that linked worktrees share most repository data while maintaining separate per-worktree files such as `HEAD` and the index. Git also documents `git worktree prune` for stale administrative files. Cursor uses isolated Git checkouts for agents, supports configuration through `.cursor/worktrees.json`, and documents parallel work, including a `best-of-n` mode. Claude documents isolated parallel sessions through worktrees. [60] [24] [61]

### Case study: Cursor and Claude make isolation explicit

Cursor's worktree model gives each agent an isolated checkout so files, dependencies, and changes for one task do not affect the main checkout. Claude's worktree documentation similarly creates a separate checkout and branch for a session. These product choices reveal the mechanism: agent coordination can remain shared, but code mutation should be physically separated. [24] [61]

The trade-off is moved, not removed. Isolation reduces live overwrite risk, but it creates merge, dependency, and cleanup work. The solo-founder answer is therefore not "Linear or worktrees." It is Linear plus Obsidian for shared state, a local `plan.md` for the current run, and worktrees for every concurrent code-writing process.

## 8. Automation and macOS Daemons Without Making the Agent the Control Plane

Use a deterministic control plane around the agents:

```text
Linear webhook or poller
        |
        v
Ingress verifier -> event deduper -> claim broker -> run scheduler
                                      |
                                      v
                              macOS supervisor
                                      |
                 +--------------------+--------------------+
                 v                    v                    v
          Claude/Codex            Cursor                 Grok/Hermes
          worktree A              worktree B             worktree C
                 |                    |                    |
                 +---------- status, heartbeats, handoffs -+
                                      |
                                      v
                           Linear + Obsidian ledger
```

Linear webhooks send HTTP push notifications for created, updated, and removed resources, including issues, comments, labels, and users. Linear requires a publicly accessible HTTPS endpoint rather than localhost, expects HTTP **200**, recommends checking the signature and timestamp, and documents retries at approximately **1 minute, 1 hour, and 6 hours** before a webhook may be disabled after continued failure. The ingress handler should verify the signature, reject stale timestamps, persist an event ID and issue revision, enqueue work, and return **200** quickly. The deduplication and queue steps are an engineering consequence of the documented retry behavior, not a Linear claim that delivery is exactly once. [37]

For a Mac-only deployment, choose one of two patterns. The simplest is a scheduled poller that queries eligible issues and reconciles leases; it avoids exposing a laptop. The more responsive pattern uses a small hosted HTTPS relay or secure tunnel that receives the webhook, performs verification, and forwards only normalized events to the Mac. Do not expose the Linear API key or provider credentials through the webhook payload or the vault.

Apple's Daemons and Services Programming Guide recommends launchd-compliant services. It documents `ProgramArguments`, `KeepAlive`, and launchd monitoring and relaunch behavior. A per-user `LaunchAgent` is appropriate for a founder's interactive fleet because it runs in the user's session; a system daemon is appropriate only when the service must run independently of login and has a carefully designed privilege boundary. Configure `RunAtLoad`, `KeepAlive` only where justified, explicit stdout/stderr paths, and exponential backoff in the supervisor so a broken agent cannot create a rapid restart loop. [72]

Keep the supervisor separate from the model process. The supervisor owns leases, timeouts, child-process termination, logs, concurrency limits, and recovery. The model adapter reads a normalized task packet and writes only to its assigned worktree and approved vault paths. This boundary lets the founder replace Claude with Codex or Grok without changing claim semantics.

## 9. Adapter Contract for Claude, Codex, Cursor, Grok, and Hermes

| Adapter | Source-supported capability | Fleet role | Guardrail |
|---|---|---|---|
| **Claude Code** | Claude agent teams use separate context windows, automatic message delivery, shared task lists, and per-recipient messaging. Teammates load project context at spawn and do not inherit the lead's conversation. | Good for lead planning, decomposition, review, or isolated implementation through worktrees. | Permission mode starts from the lead and has documented team limitations such as status lag and one team per session. Keep Linear and Obsidian as the durable cross-session record. [59] |
| **Codex CLI** | Codex CLI runs locally from a terminal, can read, change, and run code in a selected directory, and exposes approval modes. | Good for a worktree-scoped implementer or test/debug worker. | Select the least permissive approval and sandbox mode that supports the task. Do not run unattended with broad filesystem or network authority merely because the CLI can run locally. [26] |
| **Cursor** | Cursor uses isolated Git checkouts for agents, supports `.cursor/worktrees.json`, and documents parallel work including `best-of-n`. | Good for interactive founder review, visual diff inspection, and parallel candidate implementations. | Treat the Cursor worktree as a child of the same claim contract; do not let its UI state replace the Linear lease or handoff. [24] |
| **Grok Build** | xAI documents Grok Build as usable through an interactive TUI, headlessly in scripts or bots, or through the Agent Client Protocol. The Hermes integration guide describes an interactive TUI, headless `-p`, and ACP over JSON-RPC. | Good as a headless or ACP adapter when the supervisor needs a process contract. | Pin the installed version and verify the actual command and flags at startup. Treat shell, subagent, and Git capability as privileged; use a dedicated worktree and risk lane. [142] [53] |
| **Hermes Agent** | Hermes describes itself as an open-source agent that can live on a server, remember what it learns, and run on macOS, Linux, and Windows. Its CLI is a terminal UI, and its documentation describes skills and persistent memory. | Good as an orchestrator, personal assistant, or adapter host that turns Linear events into bounded coding-agent runs. | Persistent memory is not an ownership database. Keep claims in the shared protocol, keep code in a worktree, and give Hermes only the tools and paths needed for the assigned risk lane. [91] [126] |

The common adapter interface should be small:

```text
claim(issue_id) -> claim_id, lease_expiry, worktree
start(task_packet) -> process_id
heartbeat(claim_id) -> new_expiry
checkpoint(claim_id, summary, tests, next_action)
stop(claim_id, outcome) -> released or needs-human
```

Every adapter must accept the same task packet: issue ID, title, scope, allowed paths, branch/worktree, risk lane, test command, lease, handoff path, and required exit state. The adapter must return structured events rather than only terminal prose. This is how a heterogeneous fleet becomes operationally uniform.

## 10. Actionable Solo-Founder Setup Checklist

### Day 1: establish the boundaries

- [ ] Create one Linear team and workflow states: `Backlog`, `Ready`, `In Progress`, `Blocked`, `Review`, and `Done`.
- [ ] Create labels for orthogonal metadata: `agent-ready`, `agent-needs-human`, `agent-stale`, `risk-high`, and code areas. Keep lifecycle in states, not a pile of mutually exclusive labels. [44] [9]
- [ ] Create or configure agent identities with only the permissions required for the fleet. Linear documents agents as app users and supports assignment and mentions subject to installation permissions. [46]
- [ ] Create a personal API key for a private script or OAuth for a distributable application. Store it in macOS Keychain or a protected process environment, never in Obsidian. [41]
- [ ] Create an issue template containing scope, allowed paths, test command, risk lane, acceptance criteria, and a handoff link.
- [ ] Create the vault outside all repositories with `10-claims`, `20-handoffs`, `30-decisions`, and `40-run-logs`. Exclude transient caches and plugin workspaces from the operating protocol unless their behavior is understood. [87] [106]

### Day 2: make claims observable and recoverable

- [ ] Implement `claim`, `heartbeat`, `checkpoint`, `release`, and `reconcile` as deterministic functions.
- [ ] Use a single dispatcher writer for claims, or use a transactional store with a monotonic fencing token. Mirror every result to Linear and Obsidian.
- [ ] Start with the recommended **15-minute lease**, **5-minute heartbeat**, and **2-heartbeat grace period**, then tune from run data.
- [ ] On every claim, assign the agent, set state, add a claim label, re-read to verify, and append a structured comment. Resolve the current comment mutation from Linear schema introspection rather than hardcoding an undocumented operation. [83] [101]
- [ ] Build a stale-claim job that marks stale, checks the process and worktree, preserves uncommitted work, and only then offers reclaim.
- [ ] Add a daily founder view: active claims, leases expiring soon, stale claims, blocked issues, uncommitted worktrees, and agents with no heartbeat.

### Day 3: isolate code and wrap the fleet

- [ ] Make an initial repository commit before automating Claude worktrees. [61]
- [ ] Allocate one worktree per concurrent code-writing run, for example `~/fleet/worktrees/ENG-123-claude`.
- [ ] Put a run-local `plan.md` in each worktree. Link it from the Linear issue and Obsidian handoff; do not use it as the fleet-wide index.
- [ ] Implement adapters for Claude, Codex, Cursor, Grok, and Hermes behind the common task packet and exit-event interface.
- [ ] Enforce path, network, command, and credential policy before starting a child process. Codex's documented approval and sandbox modes are a useful model for explicit authority. [26]
- [ ] Run the dispatcher as a per-user `LaunchAgent` with explicit `ProgramArguments`, logs, health checks, and a controlled `KeepAlive` policy. [72]

### Every session and every release

- [ ] At startup, reconcile prior claims before taking a new issue.
- [ ] Before each expensive command, renew the lease and confirm the worktree still belongs to the claim.
- [ ] At scope change, update Linear and the handoff before editing new areas.
- [ ] At block, stop or move to `Blocked`; do not hold a silent claim.
- [ ] Before merge, the founder reviews the diff, tests, risk lane, and handoff. A human approves high-risk operations and production changes. [117]
- [ ] After merge or abandonment, release the claim, archive the handoff, prune stale worktrees, and record the outcome for future agents.

## Synthesis

The central tension is visibility versus enforcement. Linear is the best shared operational surface because it exposes assignees, states, labels, comments, and webhooks and is now explicitly marketed for human-agent collaboration. Obsidian is the best human-readable WIP surface because it is a folder of notes that a founder can inspect and a fresh agent can read. Neither should be mistaken for a fencing lock. [37] [76] [87]

| Strategy | Mechanism | Scope | Main trade-off | Evidence and time horizon |
|---|---|---|---|---|
| **Linear-only** | API fields and issue activity | Durable task and human coordination | No documented atomic claim or code isolation | Current Linear API and **2026** agent product; useful for visibility, insufficient for hard exclusivity. [41] [13] |
| **Obsidian-only** | Shared Markdown traces and Sync | WIP, decisions, handoffs, memory | Sync and file writes do not establish a distributed lock | Current Obsidian folder and Sync documentation; useful for continuity, unsafe as sole authority. [106] |
| **Plan plus worktrees** | Local narrative plus filesystem and branch isolation | One run's code and context | Stronger write safety, weaker fleet-wide discovery, plus merge cost | Git, Cursor, and Claude documentation; reliable per run, not a coordination ledger. [60] [24] |
| **Native agent teams** | Model-level delegation, task lists, messages, and separate contexts | A coordinated agent session | Context and permission boundaries can lag or differ from fleet policy | Anthropic production and Claude team documentation from **2025-2026**; powerful inside a session, still needs external durable state. [33] [59] |
| **Hybrid fleet** | Linear ledger, Obsidian WIP, brokered lease, worktree, and human gates | Entire solo-founder operation | More components and operational discipline | Recommended design: combines shared traces, isolation, crash recovery, and risk-based oversight. [55] [117] |

Three non-obvious divergences matter. First, Linear's agent-first product direction makes assignment and issue activity more valuable, while the low-level API still requires the operator to design claim concurrency. Second, stigmergic coordination rewards visible traces, while Obsidian's local copies and Sync create a reason not to use one hot file as a lock. Third, more human oversight can improve safety, but unstructured approval creates fatigue; risk lanes and post-hoc review are better than asking the founder to approve every tool call. [111] Human-in-the-Loop: A 2026 Guide

The decision-ready recommendation for August **2026** is therefore a four-layer contract: **Linear for durable coordination, Obsidian for shared WIP and handoffs, a lease-aware dispatcher for ownership, and Git worktrees for code isolation**. Start with a small number of concurrent runs, instrument stale claims and merge time, and add more agents only when the ledger remains truthful under crashes, sleep, retries, and human review.

## References

1. *GitHub - breferrari/obsidian-mind: An Obsidian vault that ...*. https://github.com/breferrari/obsidian-mind
2. *AI Agent Memory: Obsidian Vault vs Dedicated Workspace*. https://felo.ai/blog/ai-agent-memory-obsidian-vault-vs-workspace
3. *AI Undecided: notes from people building AI in plain English*. http://aiundecided.com/
4. *Syncing for teams - Obsidian Help Obsidian https://obsidian.md › teams › sync*. https://obsidian.md/help/teams/sync
5. *Sync settings and selective syncing - Obsidian Help*. https://obsidian.md/help/sync/settings
6. *Linear Developers*. https://linear.app/developers
7. *Getting started*. http://linear.app/developers/graphql
8. *Linear-native AI dev agent using Claude Code, MCP, and ...*. http://reddit.com/r/Linear/comments/1s4gqdy/linearnative_ai_dev_agent_using_claude_code_mcp
9. *Issue labels – Linear Docs*. https://linear.app/docs/labels
10. *Linear for Agents*. http://linear.app/agents
11. *Linear – The system for product development*. http://linear.app/
12. *Issue tracking is dead*. https://linear.app/next
13. *Introducing Linear Agent – Changelog*. http://linear.app/changelog/2026-03-24-introducing-linear-agent
14. *AI workflows for product teams – Linear*. http://linear.app/ai
15. *Fetched web page*. http://linear.app/careers/1d652292-04d9-405c-8101-578efd020e94
16. *Managing Handoffs in Multi-Agent Coding Sessions: Fresh ...*. https://mer.vin/2026/04/managing-handoffs-in-multi-agent-coding-sessions-fresh-context-without-losing-continuity
17. *Stale session lock files not cleaned up after agent crash*. https://github.com/openclaw/openclaw/issues/4082
18. [Bug v2026.2.12] Session .lock file persists and blocks agent ...](https://www.answeroverflow.com/m/1474425989437325415)
19. *session file locked (timeout 10000ms) causes agent to fail ...*. https://github.com/openclaw/openclaw/issues/31489
20. *Agent failed before reply - : session file locked - (timeout 60000ms*. https://www.answeroverflow.com/m/1508786431093379072
21. *Cursor Docs — Agent, Rules, MCP, Skills & CLI*. https://cursor.com/docs
22. *3 AI Agents, 3 Worktrees, 1 Repository — Git Worktree Case ...*. http://gitworktree.org/cases/parallel-ai-agents
23. *Nimbalyst: Visual Editor for Claude Code & Codex (Open Source)*. http://nimbalyst.com/
24. *Worktrees | Cursor Docs*. https://cursor.com/docs/configuration/worktrees
25. *Git worktrees for parallel AI coding agents - Upsun Developer*. https://developer.upsun.com/posts/ai/git-worktrees-for-parallel-ai-coding-agents
26. *Codex CLI*. https://developers.openai.com/codex/cli
27. *Codex CLI - Build, debug & deploy with AI*. https://openaicli.com/docs
28. *OpenAI Codex (AI agent)*. http://en.wikipedia.org/wiki/OpenAI_Codex_%28AI_agent%29
29. *Introducing Codex*. http://openai.com/index/introducing-codex
30. *openai/codex: Lightweight coding agent that runs in your ...*. http://github.com/openai/codex
31. *Anthropic*. http://anthropic.com/
32. *anthropic-agent-methodology/references/multi-agent-research ...*. https://github.com/Investigator13th/anthropic-agent-methodology/blob/main/references/multi-agent-research-system.md
33. *How we built our multi-agent research system \ Anthropic*. https://www.anthropic.com/engineering/multi-agent-research-system
34. *Stigmergy: Indirect Coordination for Multi-Agent Systems*. https://inferensys.com/glossary/multi-agent-system-orchestration/agent-swarm-intelligence/stigmergy
35. *How We Built Our Multi-Agent Research System — Signals*. https://signals.aktagon.com/articles/2026/03/how-we-built-our-multi-agent-research-system
36. *GitHub - MaxMiksa/Auto-Company: An auto-company works for 24/7 on your own PC - Windows/Linux/macOS. · GitHub*. http://github.com/MaxMiksa/Auto-Company
37. *Webhooks – Linear Developers*. https://linear.app/developers/webhooks
38. *API and Webhooks – Linear Docs*. https://linear.app/docs/api-and-webhooks
39. *launchd | mise-en-place - jdx*. http://mise.jdx.dev/bootstrap/launchd.html
40. [Linear Webhooks: Complete Guide with Payload Examples [2025]](https://inventivehq.com/blog/linear-webhooks-guide)
41. *Getting started – Linear Developers*. https://linear.app/developers/graphql
42. *linear-api | Agent Skills Library*. https://mcpservers.org/agent-skills/anthropic/linear-api
43. *GraphQL docs: clarify that IssueFilter does not ... - GitHub*. https://github.com/linear/linear/issues/1066
44. *Issue status – Linear Docs*. https://linear.app/docs/configuring-workflows
45. *Linear for Agents*. https://linear.app/agents
46. *AI Agents – Linear Docs*. https://linear.app/docs/agents-in-linear
47. *MCP server – Linear Docs*. https://linear.app/docs/mcp
48. *Linear Agent MCP support – Changelog*. https://linear.app/changelog/2026-04-23-linear-agent-mcp-support
49. *Grok Build Developer Guide: xAI's Terminal Coding Agent ...*. https://www.developersdigest.tech/blog/grok-build-developer-guide-2026
50. *Codex CLI Guide 2026: Setup, Sandbox, AGENTS.md & ...*. http://blakecrosley.com/guides/codex
51. *Codex is a coding agent from OpenAI that works everywhere you do ...*. http://facebook.com/openai/posts/codex-is-a-coding-agent-from-openai-that-works-everywhere-you-do-powered-by-chat/1358767919378148
52. *http://developers.openai.com/codex/cli*. http://developers.openai.com/codex/cli
53. *Grok — Delegate coding to xAI Grok Build CLI (features, PRs) | Hermes Agent*. http://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/autonomous-ai-agents/autonomous-ai-agents-grok
54. *The Fencing Gap: Why Your Distributed Lock Isn't Safe ...*. http://hackernoon.com/the-fencing-gap-why-your-distributed-lock-isnt-safe-and-how-to-fix-it
55. *How to do distributed locking*. http://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
56. *Implementing Distributed Locks Correctly | by Alex Razkevich*. http://medium.com/towardsdev/implementing-distributed-locks-correctly-5a35179422a6
57. *Martin Kleppmann's website*. http://martin.kleppmann.com/
58. *Lease Pattern in Distributed Systems Explained - Ajit Singh*. https://singhajit.com/distributed-systems/lease
59. *Orchestrate teams of Claude Code sessions*. https://code.claude.com/docs/en/agent-teams
60. *Git - git-worktree Documentation*. https://git-scm.com/docs/git-worktree
61. *Run parallel sessions with worktrees - Claude Code Docs*. https://code.claude.com/docs/en/worktrees
62. *Claude Code + Git Worktree + Agent Teams：多Agent 并行 ...*. https://zhuanlan.zhihu.com/p/2017290839030784536
63. *Git - git-worktree Documentation*. https://git-scm.com/docs/git-worktree/2.30.0
64. *Sync Commands | obsidianmd/obsidian-headless | DeepWiki*. https://deepwiki.com/obsidianmd/obsidian-headless/2.3-sync-commands
65. *Shared Vault forces teammates to use the same settings and theme?*. https://forum.obsidian.md/t/shared-vault-forces-teammates-to-use-the-same-settings-and-theme/72057
66. *Obsidian 1.9.10 Desktop (Public)*. https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10
67. *The Zettelkasten Method in Obsidian: A Practical Setup Guide*. http://desktopcommander.app/blog/zettelkasten-obsidian
68. *Engineering \ Anthropic*. https://www.anthropic.com/engineering
69. *How we built our multi-agent research system | Anthropic ...*. https://www.engineering.fyi/article/how-we-built-our-multi-agent-research-system
70. *How Anthropic Built Their Multi-Agent Research System ...*. https://cuizhanming.com/anthropic-multi-agent-research-architecture
71. *LLM-Coordination: Evaluating and Analyzing Multi-agent ...*. https://arxiv.org/abs/2310.03903
72. *Creating Launch Daemons and Agents*. http://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
73. *LaunchAgents and LaunchDaemons on macOS: A Complete and ...*. https://mundobytes.com/en/How-to-use-launchagents-and-launchdaemons-on-macOS
74. *Overview of using launchd to set up services on a macOS ...*. http://gist.github.com/johndturn/09a5c055e6a56ab61212204607940fa0
75. *Retry Policies*. https://www.webhooks.io/docs/relay/retry-policies
76. *AI workflows for product teams – Linear*. https://linear.app/ai
77. *How Obsidian stores data - Obsidian Help*. https://help.obsidian.md/Obsidian/Advanced+topics/How+Obsidian+stores+data
78. *Sync troubleshooting - Obsidian Help*. https://help.obsidian.md/Obsidian+Sync/Sync+troubleshooting
79. *Create a vault - Obsidian Help*. https://help.obsidian.md/Getting%2Bstarted/Create%2Ba%2Bvault
80. *Common workflows - Claude Code Docs*. http://docs.anthropic.com/en/docs/claude-code/common-workflows
81. *Orchestrate teams of Claude Code sessions*. http://code.claude.com/docs/en/agent-teams
82. *Schema | Linear API@current*. https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/inputs/IssueUpdateInput?query=labels
83. *Schema | Linear API@current - Apollo Studio*. https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/inputs/IssueUpdateInput
84. *Linear – The system for product development*. https://linear.app/
85. *obsidian-help/en/Files and folders/How Obsidian stores data ...*. https://github.com/obsidianmd/obsidian-help/blob/master/en/Files%20and%20folders/How%20Obsidian%20stores%20data.md
86. *Obsidian*. https://ca.linkedin.com/company/obsidianmd
87. *Vault - Developer Documentation*. https://docs.obsidian.md/Plugins/Vault
88. *Security and privacy - Obsidian Help*. https://obsidian.md/help/sync/security
89. *Hermes Agent Documentation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs
90. *Grok Build Install Guide: CLI, Windows, and Setup - Verdent Guides*. http://verdent.ai/guides/grok-build-install
91. *Hermes Agent | Nous Research*. http://hermes-agent.nousresearch.com/
92. *Grok Build | SpaceXAI*. https://x.ai/cli
93. *Changelog – Linear*. https://linear.app/changelog
94. *Changelog – Linear*. https://linear.app/changelog/page/10
95. *How to Add Human-in-the-Loop Approval to AI Agents (Without Killing Speed) :: I Am Stackwell*. http://iamstackwell.com/posts/human-in-the-loop-ai-agents
96. *Securing Cursor: A Security Practitioner's Guide*. http://promptarmor.com/resources/securing-cursor-a-security-practitioners-guide
97. *Claude Code Defaults to Human Approval: Auto Mode Requires ...*. https://www.techtimes.com/articles/319874/20260707/claude-code-defaults-human-approval-auto-mode-requires-explicit-opt.htm
98. *anthropics/claude-code-action*. https://github.com/anthropics/claude-code-action
99. *How we contain Claude across products - Anthropic*. http://anthropic.com/engineering/how-we-contain-claude
100. *Schema | Linear API@current - Apollo Studio*. https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/inputs/IssueCreateInput
101. *Schema | Linear API@current*. https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/inputs/CommentCreateInput
102. *Schema | Linear API@current*. https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/inputs/CommentCreateInput?query=user
103. *Changelog | Linear API@current | Studio*. https://studio.apollographql.com/public/Linear-API/variant/current/changelog/version/7bf6adc3-3725-4116-bb2e-6d20f31afd3a
104. *Troubleshoot Obsidian Sync - Obsidian Help*. https://obsidian.md/help/sync/troubleshoot
105. *Obsidian Sync*. http://obsidian.md/sync
106. *Sync your notes across devices - Obsidian Help*. https://obsidian.md/help/sync-notes
107. *Which folders to exclude to resolve syncthing conflicts*. https://www.reddit.com/r/ObsidianMD/comments/15ri9l8/which_folders_to_exclude_to_resolve_syncthing
108. *Multi-agent coordination and control using stigmergy*. http://abdn.elsevierpure.com/en/publications/multi-agent-coordination-and-control-using-stigmergy
109. *Multi-agent coordination and control using stigmergy*. http://sciencedirect.com/science/article/abs/pii/S0166361503001234
110. *Blackboard architecture for LLM multi-agent systems*. http://facebook.com/groups/DeepNetGroup/posts/2530678597325007
111. *Exploring Advanced LLM Multi-Agent Systems Based on ...*. http://arxiv.org/abs/2507.01701
112. *Stigmergy as a Universal Coordination Mechanism*. http://pespmc1.vub.ac.be/Papers/Stigmergy-varieties.pdf
113. *Human-in-the-Loop AI Agents: Deploying Agentic AI With ...*. https://www.elementum.ai/blog/human-in-the-loop-agentic-ai
114. *Human-in-the-Loop: A 2026 Guide to AI Oversight ...*. http://strata.io/blog/agentic-identity/practicing-the-human-in-the-loop
115. *AI Agent Oversight | DTEX*. https://www.dtex.ai/use-cases/ai-agent-oversight
116. *Human oversight of agentic systems in practice*. https://arxiv.org/html/2606.05391v1
117. *Artificial Intelligence Risk Management Framework*. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
118. *A launchd Tutorial*. https://www.launchd.info/
119. *tjluoma/launchd-keepalive: Mac OS X plist ...*. https://github.com/tjluoma/launchd-keepalive
120. *macos - Why is my launchd job running at boot even with ...*. https://apple.stackexchange.com/questions/128479/why-is-my-launchd-job-running-at-boot-even-with-runatload-key-set-to-false
121. *Distributed Locks and Fencing Tokens - Medium*. https://medium.com/%40felipe.ascari_49171/distributed-locks-and-fencing-tokens-31904c71f61b
122. *Distributed Locks Complete Guide 2025: Redlock, Zookeeper ...*. https://www.youngju.dev/blog/culture/2026-04-15-distributed-locks-redis-zookeeper-etcd-guide-2025.en
123. *Fencing Tokens: Preventing Split Brain Operations*. https://www.systemoverflow.com/learn/distributed-primitives/distributed-locks/fencing-tokens-preventing-split-brain-operations
124. *How to Handle SQS Message Visibility Timeout - OneUptime*. https://oneuptime.com/blog/post/2026-01-27-sqs-message-visibility-timeout/view
125. *Hermes Agent Documentation*. http://hermes-agent.nousresearch.com/docs
126. *CLI Interface | Hermes Agent - nous research Hermes Agent https://hermes-agent.nousresearch.com › docs › user-guide*. https://hermes-agent.nousresearch.com/docs/user-guide/cli
127. *hermes-agent/docs at main · NousResearch/hermes-agent · GitHub*. https://github.com/NousResearch/hermes-agent/tree/main/docs
128. *Hermes Agent — Open-Source AI Agent with Persistent Memory*. http://hermes-agent.org/
129. *Linear Customers*. https://linear.app/customers
130. *Linear-native AI dev agent using Claude Code, MCP ...*. https://www.reddit.com/r/Linear/comments/1s4gqdy/linearnative_ai_dev_agent_using_claude_code_mcp
131. *Linear (featured on Quasa.io/projects/linear) is the product ...*. https://www.instagram.com/p/DYzZZGyR18K
132. *Amazon SQS visibility timeout*. https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
133. *Vault - Developer Documentation - Obsidian Developer Docs*. https://docs.obsidian.md/Reference/TypeScript%2BAPI/Vault
134. *API for special files in vault - Developers - Obsidian Forum*. https://forum.obsidian.md/t/api-for-special-files-in-vault/80981
135. *API access to your vault : r/ObsidianMD - Reddit*. https://www.reddit.com/r/ObsidianMD/comments/17x0jzu/api_access_to_your_vault
136. *HELP : `vault.adapter.write()` VS `vault.modifyBinary()` for working ...*. https://forum.obsidian.md/t/help-vault-adapter-write-vs-vault-modifybinary-for-working-with-custom-files-to-store-json-data/113621
137. *Session Handoff Protocol: Solving AI Agent Continuity in ...*. https://blakelink.us/posts/session-handoff-protocol-solving-ai-agent-continuity-in-complex-projects
138. *Claude code session handoff prompt explained - Facebook*. https://www.facebook.com/groups/claudeaicommunity/posts/1243913117775853
139. *session-handoff · GitHub Topics*. https://github.com/topics/session-handoff?o=desc&s=forks
140. *How do you hand off from Claude chat to Claude Code?*. https://www.reddit.com/r/ClaudeAI/comments/1sthldc/how_do_you_hand_off_from_claude_chat_to_claude
141. *Managing Session State with Multiple Coding Agents Using GitHub*. https://www.facebook.com/groups/evolutionunleashedai/posts/27071470209140707
142. *Grok Build | SpaceXAI Docs - xAI API Documentation*. https://docs.x.ai/build/overview
143. *Grok Build — xAI Coding Harness*. http://teamday.ai/harness/grok
144. *Headless & Scripting | SpaceXAI Docs*. https://docs.x.ai/build/cli/headless-scripting
145. *Linear Customers*. http://linear.app/customers
146. *Coinbase's bet on agent-first development*. https://linear.app/customers/coinbase
147. *How we use Linear Agent at Linear*. http://linear.app/now/how-we-use-linear-agent-at-linear
148. *Enterprise Customers - Linear*. http://linear.app/customers/enterprise
