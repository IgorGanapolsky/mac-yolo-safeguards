# macOS System Care & Developer Utility Competitive Analysis (October 2026)

> Deep research across CleanMyMac 5.7.2 (Oct 15, 2026), `tw93/Mole` (73.2k stars), `Pearcleaner`, `iStat Menus 7`, `Sensei`, and `DaisyDisk` — and the high-ROI features stolen into `mac-yolo-safeguards` (`tools/mac-yolo-system-care-engine.js` & `MacYoloSafeguards.app`).

---

## 1. October 2026 Competitive Landscape Matrix

| Product / Tool | Core Strength | Blind Spot on AI Coding Agent Macs | What We Stole into `mac-yolo-safeguards` |
|---|---|---|---|
| **CleanMyMac 5.7.2** (Oct 15, 2026) | • **5-Tile Smart Care** (`Cleanup`, `Protection`, `Performance`, `Applications`, `My Clutter`)<br>• **2×3 Bento Grid Menu Popover**<br>• **Browser Care (5.7.2)**: high-RAM/CPU tab & renderer audit<br>• **My Activity (5.4.0)**: cumulative space & time saved | Misses AI coding agent `/private/tmp/claude-*` 47 GiB runaway logs, MCP server failures, and metered LLM token bleed (`$35–$89/yr` subscription) | • **2×3 Bento Grid HUD** (`macos/MacYoloSafeguardsApp.swift`)<br>• **5-Pillar Smart Care Engine** (`runFivePillarSmartCare`)<br>• **Browser Care** (`auditBrowserCare`)<br>• **My Activity Ledger** (`getActivityLedger`) |
| **`tw93/Mole`** (`73,270` GitHub stars, Oct 2026) | • All-in-one CLI + native app (`mo clean`, `mo purge`, `mo installer`, `mo optimize`, `mo status`)<br>• **Dry-run-first safety contract**<br>• **Protected path whitelist**<br>• **Append-only operation log (`operations.log`)** | No pre-execution LLM token budget gate, no MCP server interface, no real-time window-switch HUD | • **Whitelist protection** (`~/.hermes/mac-yolo-whitelist.json`)<br>• **Append-only operation log** (`~/.hermes/logs/mac-yolo-operations.jsonl`)<br>• **Installer & Clutter scanner** (`scanDownloadsInstallersAndClutter`) |
| **iStat Menus 7 / `exelban/stats`** | • Real-time per-process CPU & RAM culprit lists<br>• Live network `↑/↓ KB/sec` delta | Pure telemetry; does not auto-reap runaway `simruntime` loops or `/private/tmp/claude-*` | • **Top CPU & RAM Culprit Sniper** (`getTopProcessCulprits`)<br>• **Live `sysctl(NET_RT_IFLIST2)` network throughput** |
| **Pearcleaner / Sensei / OnyX** | • Orphaned app leftovers & broken `~/Library/LaunchAgents/*.plist` inspection<br>• DNS & LaunchServices cache flush | Manual GUI tools; not exposed over MCP to coding agents | • **Broken LaunchAgent Doctor** (`auditLaunchAgentsHealth`)<br>• **MCP + HTTP + Native HUD integration** |
