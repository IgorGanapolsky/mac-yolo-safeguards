---
name: webmcp-thumbgate-integration
description: Build, audit, and test WebMCP integrations for the ThumbGate control panel dashboard; exposes browser-native tools for agent automation with progressive DOM fallback
---

# WebMCP-ThumbGate Integration

Connect the ThumbGate dashboard to Chrome's WebMCP API, enabling browser-side AI tools that agents can discover and execute programmatically.

## Why This Matters

The Chrome Origin Trial for WebMCP enables the ThumbGate dashboard to:
1. **Expose AI-powered browser tools** that agents can invoke seamlessly
2. **Enable declarative form enhancements** with AI assistance
3. **Provide progressive enhancement** where WebMCP is unavailable, DOM/CDP paths remain functional

## High-ROI Tools to Implement

### 1. `generate_inference_report`
- **Risk**: read
- **Purpose**: Extract latest inference cost data from the dashboard
- **Input**: `{ dateRange: "today|week|month" }`
- **Value**: Enables agents to report costs without scraping

### 2. `update_tool_registration`
- **Risk**: write (with confirmation)
- **Purpose**: Programmatically register new browser tools from the dashboard
- **Input**: `{ toolName: string, description: string, endpoint: string }`
- **Value**: Enables dynamic tool management by agents

### 3. `audit_mcp_connection`
- **Risk**: read
- **Purpose**: Verify ThumbGate MCP connection status
- **Input**: `{ service: string }`
- **Value**: Lets agents check integration health before acting

## Implementation Files

```
webmcp-thumbgate-integration/
├── SKILL.md              # This file
├── tool-manifest.json    # WebMCP tool definitions
├── dashboard-tools/      # UI integration scripts
│   ├── register-tools.js
│   └── webmcp-proxy.js
├── assets/
│   └── webmcp-bridge.js  # Client-side registration helper
└── tests/
    └── webmcp-integration.test.js
```

## Quick Setup

1. **Copy the bridge**: Place `assets/webmcp-bridge.js` in your dashboard
2. **Register tools**: Call `registerDashboardTools()` from the dashboard entry point
3. **Verify**: Run `python3 scripts/probe_webmcp.py --browser chrome`

## Integration with Chrome Origin Trial

The token you registered (`thumbgate.app:443`) enables:
- `document.modelContext` for tool registration
- Cross-origin tool exposure (with proper `exposedTo` values)
- Progressive enhancement for non-WebMCP browsers

## Verification

```bash
# Check WebMCP availability
python3 ~/.agents/skills/chrome-webmcp/scripts/probe_webmcp.py --browser chrome

# Validate manifest
python3 ~/.agents/skills/chrome-webmcp/scripts/lint_webmcp_manifest.py tool-manifest.json --probe /tmp/webmcp-probe.json

# Run integration tests
node tests/webmcp-integration.test.js
```

## Safety Considerations

- All write operations require user confirmation (built into WebMCP tool definition)
- Tool exposure is strictly controlled via `exposedTo` array
- Read operations are non-mutating by design