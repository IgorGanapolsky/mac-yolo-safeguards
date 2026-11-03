# Agent guard

`tools/mac-yolo-agent-guard.js` keeps AI coding agents (Claude Code, Codex, Cursor) and the MCP servers they start from starving the Mac, without ever killing a live session. Reach it as:

- the CLI `bin/mac-yolo-agent-guard`, with subcommands `status`, `blame`, `clean`, `pressure`, `incidents`, `watch` and `install`
- the MCP tool `yolo_agent_guard`, with actions `status`, `clean`, `pressure` and `incidents`
- HTTP: `GET /api/agents`, `GET /api/agents/pressure`, `GET /api/agents/incidents` and `POST /api/agents/clean`

## What it may stop, and what it never touches

| Never signalled | Stopped (only with `--execute` / `execute=true`) |
| --- | --- |
| Live sessions: the Claude desktop app and its sessions, the `claude`, `codex`, `cursor-agent`, `grok`, `pool` (Poolside) and `omp` CLIs, Gemini's `agy` agent, and the Claude.app process-group wrapper | **Storms:** one command line running in 40 or more copies |
| Anything a live session launched within three parent hops: MCP servers started through `npx`/`uvx`/a shell, and hooks | **Extra copies of an orphaned MCP server:** adopted by launchd (ppid 1), not a LaunchAgent job, older than 10 minutes, with the newest copy kept |
| Agents in a terminal pane, even a detached herdr or tmux pane: someone can still type into them | **Stranded terminal agents:** an `omp`, `grok`, Poolside, Codex, Cursor or `claude` CLI that launchd adopted (its terminal is gone), with no tty, not a LaunchAgent job, and no CPU used for 30 minutes. Only the watch loop finds these, at warn or worse |
| Claude desktop sessions, however long idle: the Claude app owns them. Idle ones (2+ hours without CPU) are named in the notification so the person can archive them | |
| Apps under `/Applications` and `/System`, terminals, anything with a tty, local inference servers | |

Cool Down Fans in `tools/mac-yolo-system-care-engine.js` uses the same rules. It never reaps anything a live session started, at any depth, so a session's own `find` is left alone.

`status` also lists `mcpFanOut`: any live agent running three or more copies of the same MCP server, with the copy count and memory. These copies belong to a live agent, so the guard only reports them. On 2026-11-01 it found the ChatGPT app's Codex server holding 98 copies of 14 servers (7 threads, 5.3 GB).

Before each signal the guard re-reads the target's command line, so a reused pid is never hit. It sends SIGTERM only, never SIGKILL.

## Memory pressure

`pressure` reads three things:

- the kernel's level from `sysctl kern.memorystatus_vm_pressure_level` (1 normal, 2 warn, 4 critical)
- the free share from `memory_pressure -Q`: below 20% is warn, below 10% critical
- how fast pages come back from swap, from two `vm_stat` readings: 256 pages a second (4 MB/s) is warn, 1,024 (16 MB/s) is critical

The swap rate is what freezes the Mac. On 2026-11-03 the kernel said normal and 71% free while the Mac read 155 to 400 pages a second back from swap, with a load average of 46 on 18 cores and the CPU 77% idle: threads were waiting on disk. The old check called that normal. Apple documents the level for jetsam and notifications, not for latency, and Chromium's memory team tracks swap-in and decompression rates for the same reason ([codereview.chromium.org/2824133002](https://codereview.chromium.org/2824133002)).

How much sits in swap is reported but never raises the level, because macOS adds swap files as it needs them and leaves cold pages there.

The `watch` LaunchAgent checks every minute, with the swap rate taken over that minute. Whenever pressure isn't normal it posts a notification, at most once every 10 minutes, naming the top three memory owners and any Claude sessions idle two hours or more. At warn it stops stranded agents. It stops storms and orphan copies only when two checks in a row say critical. Apps are only named; they are never closed.

## Who holds the memory

`blame` (and `status.blame`) adds up memory by owner: the nearest live agent or installed app at or above each process. MCP servers count toward the agent that launched them, browser renderers toward the browser, a pane's agent toward that agent, and bare panes toward the terminal multiplexer. It uses physical footprint from `top`, the figure Activity Monitor shows, because RSS leaves out compressed and swapped pages.

On 2026-11-03 at 09:54 it read 45.4 GB in all: Claude 6.9 GB (15%, 73 processes counting its MCP servers), omp 5.2 GB, Chrome 5.1 GB, Grok 3.1 GB, BrowserOS 2.9 GB, herdr 2.1 GB, WindowServer 1.8 GB and Teams 1.8 GB. The HUD had shown Claude as the top hog because it ranked by RSS and by executable name, so omp, Grok and the browsers' compressed memory were undercounted.

## Login service

`tools/mac-yolo-service.js` starts at every login, so it runs no kill loop by default. `MAC_YOLO_SELF_HEAL` controls the loop:

- unset: off
- `dry-run` or `1`: reports what it would stop
- `execute`: stops it, through the agent guard

## Settings that cut the load at the source

Known leaks and settings, checked on 2026-11-01:

- **Claude Code orphans MCP servers when a session ends**, and the bug is still open. It signals only its direct child and gives it 500 ms. A server launched through `npx` or `uvx` leaves its grandchild running.
  - Point MCP configs at the server binary directly, such as `node /path/server.js` or a pinned venv's python.
  - Sources: [claude-code#1935](https://github.com/anthropics/claude-code/issues/1935) and the [MCP docs](https://code.claude.com/docs/en/mcp).
- **Claude Code: load only the servers a task needs.**
  - Use `--strict-mcp-config --mcp-config <file>` for scripted runs, and `disabledMcpServers` per project.
  - Lower `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20).
  - Source: [environment variables](https://code.claude.com/docs/en/env-vars).
- **Idle sessions grow.** Restart long-lived sessions with `claude --resume`, and measure them with `footprint <pid>` rather than RSS. Source: [claude-code#18859](https://github.com/anthropics/claude-code/issues/18859).
- **Codex: each subagent starts its own MCP servers.**
  - Lower `agents.max_concurrent_threads_per_session`.
  - Set `enabled = false` on unused `mcp_servers`.
  - Prefer `url` (HTTP) servers.
  - Source: [codex#17832](https://github.com/openai/codex/issues/17832).
- **Cursor: every agent worker starts every server in the global `~/.cursor/mcp.json`.** Keep project-only servers in the project's `.cursor/mcp.json`. Source: [Cursor forum](https://forum.cursor.com/t/private-workers-accumulate-without-cleanup-leaking-mcp-server-processes-and-consuming-10-gb-ram/166837).
- **Share heavy servers.** Run each one once over streamable HTTP under its own LaunchAgent on 127.0.0.1, instead of one stdio copy per session. Source: [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
