# Mac YOLO Safeguards — ProductHunt Launch & Distribution Playbook

## 1. Product Metadata

* **Product Name**: Mac YOLO Safeguards
* **Tagline**: OS-level freeze guard, Dual-Model MoA router & translucent HUD for AI coding agents
* **Product Links**:
  * GitHub (MIT): [https://github.com/IgorGanapolsky/mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards)
  * Direct Release (v1.1.0 Notarized DMG / Zip): [https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v1.1.0](https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v1.1.0)
  * Pro Rule-Pack Kit ($49): [https://iganapolsky.gumroad.com/l/vcrho](https://iganapolsky.gumroad.com/l/vcrho)
* **Categories**: Developer Tools, Artificial Intelligence, Mac Apps, Open Source
* **Target Audience**: Software engineers, agency founders, and developers running Claude Code, Cursor, Codex, or local LLMs unattended in YOLO mode (`--dangerously-skip-permissions`).

---

## 2. Short Description (Product Hunt Gallery)

> Autonomous coding agents in YOLO mode are incredible—until a looping subagent spawns 250 simulator processes, pegs your Apple Silicon CPU at 100%, and freezes your Mac in the middle of a work day.
>
> **Mac YOLO Safeguards** is a native macOS menubar app and OS-level harness that keeps AI agents honest. It features:
> 1. **Live Menubar Pill & Translucent Bento HUD**: Real-time telemetry tracking per-core CPU, AGX GPU, Mach VM memory pressure, active agent swarms, and APFS reclaimed waste.
> 2. **Dual-Model Mixture-of-Agents (MoA) Router**: Implements RouteMoA zero-pre-inference intent scoring—routing lightweight tasks to fast local models (-90% cost) while reserving heavy multi-file reasoning for frontier LLMs.
> 3. **Agentic GraphRAG Common Factual Ground**: Multi-hop graph verification that guarantees critical system daemons, reserve ports (e.g. Dayglass), and live agent sessions are never terminated accidentally.
> 4. **One-Touch "Cool Down Fans & Clean AI Waste"**: Automatically renices runaway background indexers, cleans stale `/private/tmp` build caches, and shuts down idle Xcode simulators in 200ms.

---

## 3. Maker Comment (First Comment by Igor Ganapolsky)

```markdown
Hey Product Hunt! 👋

I'm Igor, creator of Mac YOLO Safeguards.

A few months ago, I was running an autonomous coding agent loop on my Mac mini with `--dangerously-skip-permissions`. An hour later, I came back to a spinning beachball and a jet-engine fan. An unmonitored agent had booted an iPhone simulator, gotten stuck in a retry loop, and spawned 256 child processes. My kernel load average was 307. Hard-reboot territory.

I realized that prompt rules alone cannot protect your machine—when an agent is in an execution loop, you need **OS-level guardrails** and **verifiable factual grounding**.

So I built Mac YOLO Safeguards. It's written in Swift and Node.js:
- It runs in your menu bar, monitoring your Apple Silicon GPU, CPU cores, and Mach VM pressure.
- It integrates an **Agentic GraphRAG Common Factual Ground** that understands process topologies—so it never kills your active Claude or Cursor session, while instantly spotting runaway child loops.
- It implements a **Dual-Model Mixture-of-Agents Router** inspired by recent RouteMoA and Attention-MoA research, letting you route fast local diffs to 3B models while saving heavy multi-file synthesis for frontier models.
- It's 100% open source under MIT and signed with an official Apple Developer ID certificate.

I'd love your feedback, bug reports, and suggestions!
```

---

## 4. Multi-Platform Launch Day Execution Schedule (EST)

| Time | Platform | Action | Content / Asset |
| :--- | :--- | :--- | :--- |
| **12:01 AM PST** | **Product Hunt** | Publish listing live | Set scheduled launch date; upload screenshots & maker comment. |
| **08:15 AM EST** | **Hacker News** | Submit **Show HN** | *Show HN: Mac YOLO Safeguards – OS-level runaway protection & Dual-Model MoA router for AI coding agents* |
| **08:45 AM EST** | **LinkedIn** | Igor's Profile Post | Narrative post: *"How an AI coding agent hit load average 307 on my Mac (and how we stopped it at the OS layer)"* |
| **09:15 AM EST** | **X / Twitter** | Thread | 5-tweet breakdown with menubar pill screenshot, code snippets of the GraphRAG safeguard, and GitHub release link. |
| **09:30 AM EST** | **Bluesky** | Post with link card | Automated broadcast to the indie dev and AI agent community. |
| **11:00 AM EST** | **Reddit (r/macapps, r/LocalLLaMA)** | Discussion Post | Post-mortem analysis on agent child process runaway and resource governors. |

---

## 5. Required Screenshots & Media Assets

1. **Asset 1 (Hero)**: Translucent Purple Bento HUD open on macOS desktop showing CPU, GPU, Disk, Swarm breakdown, and "Cool Down Fans" receipt.
2. **Asset 2 (Menubar Pill)**: Close-up of the dynamic menubar item (`GPU 34% · CPU 26% · DISK 417G`).
3. **Asset 3 (Architecture Diagram)**: Dual-Model MoA (Tier 1 Proposer vs Tier 2 Aggregator) + Agentic GraphRAG Common Factual Ground schema.
4. **Asset 4 (CLI Terminal)**: Running `node tools/agentic-graphrag-safeguard.js --verify-action kill "mediaanalysisd"` blocking unsafe terminations.
