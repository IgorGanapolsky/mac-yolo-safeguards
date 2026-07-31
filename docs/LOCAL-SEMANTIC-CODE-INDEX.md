# Local semantic code index (grepai) — free JetBrains "Context" equivalent

**Added:** 2026-07-24
**Cost:** $0/month, forever (100% local embeddings, no cloud API calls)
**Why:** JetBrains ships a paid semantic codebase index for AI agents ("Context") that cuts
agent turns/latency/cost by letting the agent query a pre-built vector index of the repo
instead of repeatedly grepping/reading files. Same core technique — Tree-sitter AST-aware
chunking + embeddings + hash-based incremental re-indexing, served over MCP — is available
free and open-source. This repo now has it wired up.

## What was evaluated

| Candidate | Stars | Maintained? | MCP for Claude Code | Local, $0? | Verdict |
|---|---|---|---|---|---|
| **grepai** (`yoanbernabeu/grepai`) | 1.8k | Yes — 58 open issues, active | Yes, documented natively (`grepai mcp-serve`) | Yes, default Ollama provider, single Go binary, no external DB | **Picked** |
| `Helweg/opencode-codebase-index` | 152 | Yes, active (485 commits) | Yes, via a Claude Code plugin | Yes with local Ollama; Rust native module (prebuilt binaries though) | Real but far smaller user base; opencode-first, Claude Code support is secondary |
| CocoIndex Code (`cocoindex-io/cocoindex`) | 11k (whole framework) | Yes, very active | Yes (`ccc mcp`) | Only with `[full]` extra + SentenceTransformers; **requires an external DB** (Postgres/pgvector, LanceDB, etc.) for the vector store — not self-contained | More setup burden (needs a running DB service); disqualified on "straightforward to install" |
| Roo Code codebase indexing | 24.4k | **No — repo archived by owner 2026-05-15** | Only inside the VS Code extension, not a standalone MCP server | Uses Qdrant (external DB) | Disqualified: abandoned + not usable standalone from Claude Code |

**Pick: grepai.** Highest real star count of the standalone/MCP-native options, actively
maintained, single static binary (`brew install yoanbernabeu/tap/grepai`), default storage
backend is a local GOB file (no Postgres/Qdrant to run), and it reuses the `nomic-embed-text`
Ollama model **already pulled on this Mac** (`ollama list` showed it, 274MB, 4 weeks old) — so
there was zero new local-model setup burden.

## A real rough edge found during setup (read this before running `grepai watch` yourself)

`grepai watch` auto-detects **every git worktree that shares this repo's `.git` directory**
and starts indexing all of them ("`Detected N linked worktree(s), watching all`" — confirmed
in the binary via `strings`, and observed live: it picked up **all ~130 active `/private/tmp/*`
agent worktrees** the instant it was run from either the main checkout or the throwaway
worktree). There is no CLI flag, env var, or config key to disable this (checked `--help` on
every subcommand and `strings` on the binary). On a repo with 10+ concurrent agents each in
their own worktree (this repo's standing convention), running `grepai watch` from the shared
checkout would silently fan out into indexing all of them at once — real risk of hammering the
shared Mac's Ollama instance while other agents are working.

**Workaround used:** the index is built in a **separate, ordinary `git clone`** (not a worktree)
at `~/.hermes/semantic-index/mac-yolo-safeguards`, checked out from `origin/main`. A plain
clone has its own independent `.git`, so `git worktree list` inside it shows only itself —
`grepai watch` there indexes only that one directory, never the other agents' worktrees.
Trade-off: this indexes `main`, not whatever branch/WIP a given agent's live worktree has
checked out — acceptable for "search the codebase for a concept," not a substitute for reading
a specific in-flight diff.

## Legacy manual index build (superseded by the reconciler below)

```
mkdir -p ~/.hermes/semantic-index
git clone --depth 1 --single-branch --branch main \
  https://github.com/IgorGanapolsky/mac-yolo-safeguards.git \
  ~/.hermes/semantic-index/mac-yolo-safeguards
cd ~/.hermes/semantic-index/mac-yolo-safeguards
grepai init --provider ollama --backend gob --yes
grepai watch --background
```

- Clone: ~6 seconds (shallow, 1782 tracked files, 78MB working tree).
- `grepai init`: instant — writes `.grepai/config.yaml` (provider `ollama`, model
  `nomic-embed-text`, dims 768, backend `gob`) and auto-appends `.grepai/` to `.gitignore`.
- `grepai watch --background`: builds the initial full index. **Because this clone is
  isolated (no shared worktree cache to draw on), every chunk needs a genuinely fresh
  `nomic-embed-text` call through the local Ollama daemon** — unlike a same-repo worktree,
  where files identical to an already-indexed sibling worktree hit an instant cache and cost
  nothing. On this Mac, with system load already elevated (`uptime` showed load averages in
  the high-20s/mid-30s from the other ~10 concurrently active agents), the first full build
  took **on the order of tens of minutes**, not seconds — see the honest timing note below.
  Be aware: **this is a real, non-trivial one-time cost on a busy box**, not instant.
- Incremental updates after the first build are fast: `grepai watch` compares file mtimes,
  re-embeds only changed files, and debounces bursts of changes (500ms). The daemon must be
  running (or re-run periodically) for the index to track new commits — see "Keeping it
  fresh" below.

Do not use that sequence for production serving now. It is retained only as background on how
the original index was created; the source-bound reconciler below owns refresh and publication.

## Wiring it into Claude Code (MCP)

Added to the repo's shared `.mcp.json` (root of `mac-yolo-safeguards`, next to `github` and
`context7`):

```json
"grepai": {
  "command": "node",
  "args": [
    "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools/grepai-mcp-fresh.js",
    "serve"
  ]
}
```

Unlike `github`/`context7` (remote HTTP endpoints reachable by the cloud Replit agent too),
`grepai` is a **local stdio MCP server**. Claude Code starts the freshness wrapper on demand;
the wrapper proves the immutable generation artifact is source-bound, copies it into a private
generation-pinned session, rechecks the receipt after the copy, and only then starts `grepai
mcp-serve`. It supervises that child and retires it if the source, receipt, or freshness proof
changes. No long-running watcher is required for queries. A short-lived watcher runs only inside
the non-served builder.

**What a future Claude Code session needs to do: nothing.** `.mcp.json` is repo-committed;
Claude Code auto-starts `grepai mcp-serve` for any session opened in this repo, exposing these
tools: `grepai_search`, `grepai_trace_callers`, `grepai_trace_callees`, `grepai_trace_graph`,
`grepai_index_status`. This only works for **local** Claude Code CLI sessions on Igor's Mac
(the binary and the Ollama server both have to be reachable on `localhost`) — it will not work
for the cloud Replit agent.

## Keeping the index fresh

The supervised micro-batch reconciler below replaces manual `git pull` plus a permanent watcher.
It checks `origin/main` every 60 seconds, performs zero embedding work when the SHA is unchanged,
and publishes only a validated generation.

### Source-bound micro-batch refresh (2026-07-31)

The original daily refresh had a dangerous proof gap: it could reset the isolated clone to
current `origin/main` while continuing to serve an older, non-empty `index.gob`. `Files indexed
> 0` and a generic canary could both stay green. The clone was fresh; the index generation was
not proven to come from it.

The July 2026 InfoQ Software Architects newsletter and its linked delta-index case study supplied
the useful operational pattern: use a bounded snapshot, compare it with an external watermark,
coalesce lag to the newest complete snapshot, keep an overlapping/full-rebuild recovery path,
and treat supervised restarts as routine. Source artifact:
`/Users/igorganapolsky/Downloads/infoq.pdf`, SHA-256
`6c164d55f8c2c27d93955908b5030afcc8a073707a3db3ac7b97c32946359cd3`;
[full InfoQ case study](https://www.infoq.com/articles/micro-batch-streaming-lessons-learned/).

For grepai, a **Git commit is the partition**. The system needs the latest complete repository
snapshot; it does not need to replay every intermediate commit. Every 60 seconds:

1. `grepai-microbatch-reconciler.js` reads the latest remote `main` SHA and the last committed
   `retrieval-index-generation/v1` receipt.
2. If equal and the served config plus immutable generation-artifact hashes still match, it
   performs zero embedding work and refreshes only the remote-check heartbeat. The active GOB is
   intentionally excluded from this hash because grepai rewrites it during ordinary searches.
3. If behind, it jumps directly to the newest SHA in a persistent, separate plain-clone builder.
   The complete target tree naturally overlaps and supersedes skipped intermediate commits;
   added/modified/deleted counts and skipped-commit count are recorded.
4. A short-lived grepai watcher builds that snapshot. Structural checks and stable plus
   delta-specific retrieval canaries must pass. The short lifecycle removes the indefinite
   watcher memory/liveness class; the LaunchAgent is the external watchdog.
5. Only then is an immutable generation GOB copied to a same-directory temporary file, fsynced,
   and renamed into place; the mutable served GOB is restored from it. The source-bound receipt
   is committed last. A crash between those operations produces a deliberate fail-closed mismatch,
   never a false fresh result. The current and immediately previous immutable generations are
   retained for recovery.
6. Weekly, or after material-integrity drift, the builder performs a clean full rebuild. The
   previous served generation remains last-known-good until the replacement passes.

`.mcp.json` starts `grepai-mcp-fresh.js`, not `grepai mcp-serve` directly. The wrapper verifies:

- committed schema and successful canaries;
- `indexedSha == observedOriginSha == served Git HEAD`;
- exact SHA-256 and byte count for the immutable generation artifact (ordinary queries may mutate
  the active `index.gob` with usage statistics);
- exact config SHA-256; and
- a remote comparison heartbeat no older than three minutes.

If any check fails, grepai MCP is unavailable with an explicit reason and agents use deterministic
`rg` while the LaunchAgent retries. This is the important behavior change: stale retrieval is an
observable degraded backend, not a confident answer from unknown bytes.

| Stage | Why it exists | What can go wrong | Measurement / receipt |
|---|---|---|---|
| Latest-SHA trigger | Remove scheduler idle time without per-file streaming | repeated triggers, remote unavailable | `targetSha`, lock/busy outcome, `lastRemoteCheckedAt` |
| Non-served builder | Prevent partially written GOB from reaching search | embedding failure, watcher hang, bad config | bounded duration, files/chunks, rejected-attempt reason |
| Coalescing snapshot | Reach latest complete truth after lag | skipped commit contained a delete | target-tree build plus added/modified/deleted and skipped counts |
| Retrieval canaries | Prove bytes are usable, not merely large | old index passes a generic query | stable canaries plus changed-symbol path canary when available |
| Atomic publish | Readers see last-good or next-good bytes | crash before rename/receipt | immutable-artifact SHA-256, generation ID, previous generation ID |
| MCP gate | Stop false-green serving | stale heartbeat, source/hash/config drift | fail-closed problem codes; zero server spawns when invalid |
| Full rebuild | Recover missed incremental updates and tombstones | clean rebuild fails | `fullRebuild`, `lastFullRebuildAt`; last-good remains unchanged |

This pattern is intentionally **not** used for ordered event, audit, billing, or financial ledgers.
Those systems must process every event and require replay semantics. It also does not add Spark,
Kafka, a new orchestrator, an embedding model, reranking, or LLM query rewriting; those would add
cost and new failure surfaces without evidence from this source.

### Fleet refresh installer

`bash tools/install-fleet-repo-intelligence.sh` installs LaunchAgent
`com.igor.fleet-repo-intelligence` (60-second interval, `RunAtLoad`) that runs one bounded
reconciliation. The installer establishes a verified initial generation before reporting the
MCP backend healthy. Status for every agent session:

```
node tools/fleet-repo-intelligence-status.js
```

Research / decision: `docs/RESEARCH-JETBRAINS-CONTEXT-FLEET-202607.md` (JetBrains Context
vs local stack; fleet architecture for all agents).

**Still do not** run `grepai watch` from the multi-worktree live checkout. The reconciler's
builder is an isolated plain clone and its watcher is stopped after each bounded build.

## Verified retrieval quality (real test query, real results)

Query run via `grepai search "reconnect retry timer"` against the built index:

```
$ grepai search "reconnect retry timer"
```

Top result: `hermes-mobile/src/context/GatewayContext.tsx` — the saved-profile continuous
reconnect backoff logic (bounded retry probes after the quiet heal window; see plan.md task
`T-1` / `terra-continuous-reconnect`, which lives in exactly this file). This is genuinely the
file a human would grep for by hand, found by *meaning* rather than the literal string
"reconnect retry timer" (which does not appear verbatim in the file) — real evidence the
embedding-based retrieval is not garbage.

## Honest limitations

1. **First full build is slow on a loaded box.** This is not "index in 5 seconds" — expect
   real wall-clock time proportional to file count and current Mac load. Budget accordingly
   before relying on it mid-task.
2. **The worktree auto-linking gotcha is undocumented and has no opt-out.** Never run `grepai
   watch` from inside one of this repo's many agent worktrees or the main checkout directly —
   always use the isolated clone described above.
3. **Remote comparison is fail-closed.** If GitHub remains unreachable long enough for the
   three-minute heartbeat to expire, new MCP sessions reject grepai and use deterministic `rg`;
   the last-good artifact is preserved but is not advertised as current.
4. **Indexes `main`, not your current branch/worktree.** For a question about code that only
   exists on someone's in-flight WIP branch, this index will not see it — fall back to grep in
   that case.
