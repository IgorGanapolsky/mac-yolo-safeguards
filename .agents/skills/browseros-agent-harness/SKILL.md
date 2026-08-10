---
name: browseros-agent-harness
description: BrowserOS & BrowserOS Neo Agent Automation Protocol. Automates real local browser sessions, persistent account logins (Skool, GitHub, Stripe, Linear), local file access, and 53 browser automation MCP tools across all coding agents on Igor's Mac.
---

# BrowserOS & BrowserOS Neo Agent Skill

Use this skill whenever executing web browser automation tasks, account login operations, DOM manipulation, or browser-based AI agent workflows across Claude Code, Gemini CLI, Cursor, Codex, and Antigravity.

## Core Capabilities & Directives

### 1. Dedicated Agent Browser (`BrowserOS Neo`)
- **Protocol**: Leverages `browseros-neo` MCP server tools (`tabs`, `navigate`, `snapshot`, `act`, `download`, `upload`, `read`, `grep`, `screenshot`, `pdf`, `wait`, `evaluate`, `run`).
- **Profile**: Uses Igor's active persistent local profile with pre-authenticated logins across Skool, GitHub, Stripe, Linear, and email portals.
- **Privacy-First**: Operates locally with zero mandatory cloud relays.

### 2. Multi-LLM Driver Support
- Supports 13 AI providers including local Ollama (PagedAttention harness), OpenRouter (500+ models), Moonshot Kimi K2.5, Google Gemini, and Anthropic Claude.

### 3. Automated Web Actions
- Execute `node tools/browseros-agent-harness.js --status` to inspect active MCP tools and persistent profile health.
- Execute `node tools/browseros-agent-harness.js --navigate <URL>` for zero-human-intervention page navigation and snapshotting.

### 4. Built-in App Integrations (MCP)
- Connects browser DOM state to 40+ app integrations including Gmail, Slack, Notion, and Google Calendar.
