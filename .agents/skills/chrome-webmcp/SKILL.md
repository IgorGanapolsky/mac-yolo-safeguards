---
name: webmcp-agent-readiness
description: Build, audit, and test browser-native WebMCP tools with Chrome document.modelContext or declarative form annotations; use for Chrome WebMCP, agent-friendly web actions, journey evaluation, browser tool schemas, or modelContext integration.
---

# Chrome WebMCP

Use WebMCP as progressive enhancement: the human interface and ordinary DOM automation must still work when `document.modelContext` is unavailable.

## Start with a real capability receipt

```bash
python3 ~/.agents/skills/chrome-webmcp/scripts/probe_webmcp.py --browser all
```

Current measured routing on this Mac:

- Chrome Stable 151 and Canary 154: imperative registration, discovery, and execution pass in isolated headless profiles with WebMCP test flags.
- BrowserOS Neo 148: `document.modelContext` is unavailable; keep using its DOM/CDP path until a fresh probe passes.

Do not call a browser or site WebMCP-ready from its version or source code alone. Require the probe or an equivalent page-level `registerTool` → `getTools` → `executeTool` receipt.

## Build workflow

1. Choose one non-overlapping function per tool. Prefer a declarative annotated form for an existing form; use the imperative API for app logic, navigation, diagnostics, or stateful actions.
2. Copy `assets/webmcp-kit.js` for imperative tools or adapt `assets/declarative-form.example.html` for forms. Feature-detect the API and preserve the ordinary UI fallback.
3. Describe the intended tools and journey evaluations in a manifest based on `assets/manifest.example.json`. Static-only authoring checks are explicit:

```bash
python3 ~/.agents/skills/chrome-webmcp/scripts/lint_webmcp_manifest.py path/to/webmcp-tools.json --static-only
```

4. Produce a fresh isolated browser receipt, then run the readiness audit. A manifest without that receipt is `unverified` and exits nonzero; static validity alone is never `ready`.

```bash
python3 ~/.agents/skills/chrome-webmcp/scripts/probe_webmcp.py --browser all --output /tmp/webmcp-probe.json
python3 ~/.agents/skills/chrome-webmcp/scripts/lint_webmcp_manifest.py path/to/webmcp-tools.json --probe /tmp/webmcp-probe.json
```

5. Test deterministic validation and a real Chromium implementation:

```bash
python3 ~/.agents/skills/chrome-webmcp/scripts/test_manifest_lint.py
node ~/.agents/skills/chrome-webmcp/scripts/test_webmcp_kit.mjs
python3 ~/.agents/skills/chrome-webmcp/scripts/probe_webmcp.py --browser chrome
```

6. Add app-specific unit, browser, and evaluation cases. Prove UI state changes separately from the tool return value.

Read [the tool and security contract](references/contract.md) before exposing tools cross-origin, auto-submitting forms, or registering write/external-action tools.

## System install

After changing this skill, mirror the tested copy across agent homes:

```bash
bash ~/.agents/skills/chrome-webmcp/test.sh
bash ~/.agents/skills/chrome-webmcp/scripts/sync_agent_homes.sh
```

## Relationship to sibling capabilities

- This skill is the fleet-wide readiness gate and runtime proof source.
- `webmcp-instrument-site` is a Claude-side authoring reference; route its readiness claims through this skill's linter and probe.
- `agent-mystery-shopper` audits a customer journey and stops before unauthorized external submission. It does not prove WebMCP support.
- The daily funnel-truth LaunchAgent proves URL/status/body availability only, not tool discovery, execution, or journey completion.
