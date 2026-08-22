---
name: meta-glasses-hermes
description: >
  Meta Ray-Ban Smart Glasses Hardware, Android Phone Companion, OpenClaw MCP &
  Deep Hermes Inference Action Bridge. Features 4-hour meeting recording, real-time
  multilingual translation (RU/ES/EN), physical rack & K8s incident OCR, OpenClaw
  agent dispatch, and air-gapped privacy quarantine. Trigger: /meta-glasses-hermes.
---

# Meta Glasses + Hermes & OpenClaw IT Copilot Suite (August 2026)

Connects Meta smart glasses (Ray-Ban Meta Gen 2, Qualcomm AR1) to the sovereign
Hermes & OpenClaw AI engine for real-time IT operations, incident triage, and hands-free memory persistence.

## Architecture Topology

```
[Glasses 5-Mic Array & 12MP Camera]
                │ (Bluetooth HFP/A2DP)
                ▼
[Android Companion: Samsung Galaxy S25]
   • Meta View Live Translation (RU ⟷ EN ⟷ ES)
   • 4-Hour Meeting Audio Ingestion
   • /sdcard/Download/Meta AI/ Media Sync
                │ (ADB / Tailscale Peer-to-Peer)
                ▼
[Mac Sovereign Gateway & Inference Mesh]
   • LiteLLM :4010 (GLM-5.3, Gemini 3.7 Flash)
   • Ollama :11434 (Qwen 3.5 64k, Qwen-VL)
   • OpenClaw MCP Broker (:8766 / Tailscale)
   • LaunchAgent ai.hermes.glasses-ingest
                │
    ┌───────────┴───────────┐
    ▼                       ▼
[Obsidian Meeting Vault] [OpenClaw IT MCP Tools]
```

## Core Superpowers & Workflows

### 1. 🌐 Real-Time Multilingual Live Translation
* **Russian (`ru`)**: Native `Milena` voice synthesis + GLM-5.3 interpreter.
* **Spanish (`es`)**: Native `Paulina` / `Mónica` voice synthesis.
* **Script Auto-Detection**: Inspects Cyrillic and Spanish diacritics to automatically route speech to the correct native voice.

```bash
# Real-time CLI Translation
node tools/meta-glasses-hermes-bridge.js --translate-ru "All deployment checks passed."
node tools/meta-glasses-hermes-bridge.js --translate-es "System metrics are within nominal thresholds."
```

### 2. 🖥️ Physical Server Rack & Datacenter Vision
* **Tool**: `it_diagnose_hardware`
* **Workflow**: Glasses camera snapshot $\rightarrow$ `vision-gemini` inspects switch link LEDs (amber vs solid green 10G), redundant PSU lines, and ToR patch panel strain relief.

### 3. 🚨 Terminal & K8s Incident Triage
* **Tool**: `it_analyze_incident`
* **Workflow**: Retinal capture of stack trace / Grafana panic $\rightarrow$ parses error $\rightarrow$ generates targeted `kubectl` rollout and logs commands.

### 4. 🎙️ 4-Hour Continuous Meeting Vault
* **Tool**: `openclaw-meeting-vault.js`
* **Workflow**: 5-mic beamforming array captures continuous audio on phone $\rightarrow$ syncs to Mac $\rightarrow$ extracts markdown checkboxes (`- [ ]`) $\rightarrow$ saves to `~/Documents/Obsidian Vault/Meetings/` and indexes in `~/.openclaw/memory/meetings.jsonl`.

### 5. 🛡️ Air-Gapped Zero-Leak Quarantine
* Inadvertently captured client secrets, private keys, or non-consenting faces trigger `action: quarantine`. Media is held locally in `~/.hermes/glasses/quarantine/` with zero cloud egress.

## Testing & Verification

```bash
# Run unit & integration test suite
node --test tests/test-meta-glasses-hermes-bridge.js
node --test tests/test-openclaw-meeting-vault.js
node --test tests/test-glasses-it-superpowers-e2e.js
```
