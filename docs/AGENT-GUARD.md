# Agent guard

`tools/mac-yolo-agent-guard.js` keeps AI coding agents (Claude Code, Codex, Cursor) and the MCP servers they start from starving the Mac, without ever killing a live session. Reach it as:

- the CLI `bin/mac-yolo-agent-guard`, with subcommands `status`, `clean`, `pressure`, `incidents`, `watch` and `install`
- the MCP tool `yolo_agent_guard`, with actions `status`, `clean`, `pressure` and `incidents`
- HTTP: `GET /api/agents`, `GET /api/agents/pressure`, `GET /api/agents/incidents` and `POST /api/agents/clean`

## What it may stop, and what it never touches

| Never signalled | Stopped (only with `--execute` / `execute=true`) |
| --- | --- |
| Live sessions: the Claude desktop session, the `claude`, `codex` and `cursor-agent` CLIs, and the Claude.app process-group wrapper | **Storms:** one command line running in 40 or more copies |
| Anything a live session launched within three parent hops: MCP servers started through `npx`/`uvx`/a shell, and hooks | **Extra copies of an orphaned MCP server:** adopted by launchd (ppid 1), not a LaunchAgent job, older than 10 minutes, with the newest copy kept |
| Apps under `/Applications` and `/System`, terminals, anything with a tty, local inference servers | |

Cool Down Fans in `tools/mac-yolo-system-care-engine.js` uses the same rules. It never reaps anything a live session started, at any depth, so a session's own `find` is left alone.

Before each signal the guard re-reads the target's command line, so a reused pid is never hit. It sends SIGTERM only, never SIGKILL.

## Memory pressure

`pressure` reads the kernel's level from `sysctl kern.memorystatus_vm_pressure_level` (1 is normal, 2 warn, 4 critical) and the free share from `memory_pressure -Q`.

- Below 20% free is warn, and below 10% free is critical.
- Swap use is reported but never raises the level on its own, because macOS adds swap files as it needs them and leaves cold pages in them.

The `watch` LaunchAgent checks memory every minute. Whenever pressure isn't normal, it posts a notification at most once every 10 minutes. It stops storms and orphan copies itself only when two checks in a row say critical. Apps are only named in the notification; they are never closed.

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
