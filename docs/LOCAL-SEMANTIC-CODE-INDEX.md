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

## Index build

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

## Wiring it into Claude Code (MCP)

Added to the repo's shared `.mcp.json` (root of `mac-yolo-safeguards`, next to `github` and
`context7`):

```json
"grepai": {
  "command": "grepai",
  "args": ["mcp-serve", "/Users/igorganapolsky/.hermes/semantic-index/mac-yolo-safeguards"]
}
```

Unlike `github`/`context7` (remote HTTP endpoints reachable by the cloud Replit agent too),
`grepai` is a **local stdio MCP server** — Claude Code spawns the `grepai` binary itself, on
demand, per session, using the standard MCP stdio transport. There is **no separate daemon
required to be running for MCP tool calls to work** — `grepai mcp-serve <path>` reads directly
from the persisted `.grepai/index.gob` at that path and serves it, exactly like the `grepai
search` CLI command does. The **only reason to also run `grepai watch --background`** in that
same clone is to keep the index up to date as the repo changes on GitHub.

**What a future Claude Code session needs to do: nothing.** `.mcp.json` is repo-committed;
Claude Code auto-starts `grepai mcp-serve` for any session opened in this repo, exposing these
tools: `grepai_search`, `grepai_trace_callers`, `grepai_trace_callees`, `grepai_trace_graph`,
`grepai_index_status`. This only works for **local** Claude Code CLI sessions on Igor's Mac
(the binary and the Ollama server both have to be reachable on `localhost`) — it will not work
for the cloud Replit agent.

## Keeping the index fresh

The index is a point-in-time snapshot of whatever was on `origin/main` when it was built (plus
anything indexed since if the watcher has been running). It does **not** auto-pull from GitHub.
To refresh:

```
cd ~/.hermes/semantic-index/mac-yolo-safeguards
git pull
grepai watch --background   # re-embeds only what changed since last run
```

There is no cron/launchd job installed for this yet — refreshing is a manual step. If this
index proves useful enough to rely on daily, the natural next step is a daily `git pull &&
grepai watch --background` launchd job (not done in this change to avoid adding an unrequested
background job to an already-busy machine without asking first).

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
3. **No auto-refresh.** The index goes stale the moment `main` moves and nobody runs `git pull
   && grepai watch` again. It is a snapshot tool, not a live mirror, until someone wires a
   scheduled refresh.
4. **Indexes `main`, not your current branch/worktree.** For a question about code that only
   exists on someone's in-flight WIP branch, this index will not see it — fall back to grep in
   that case.
