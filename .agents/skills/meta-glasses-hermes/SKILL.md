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

## Hard honesty (do not confuse these rails)

| Rail | What it is | Answers "connected to Hermes?" |
|------|------------|--------------------------------|
| **Meta AI wake word** ("Hey Meta") | Meta's closed assistant | **Always no** for Hermes/OpenClaw |
| **Phone BT** (Meta AI app ↔ RB Meta) | Glasses bonded to Galaxy | Connected to **Meta**, not Hermes |
| **Hermes companion / DAT** | Hermes Mobile session via Wearables DAT | Only after Hermes is installed + DAT session |
| **Mac bridge** (`tools/meta-glasses-hermes-bridge.js`) | Status/TTS/vision/OpenClaw MCP | Reports phone_bt vs mac_bt truthfully |

## HARD: phone-only Bluetooth (CEO 2026-08-22)

Glasses BT belongs to the **phone only**. The Mac must never pair/steal `RB Meta 00F1`.

| NEVER | ALWAYS |
|-------|--------|
| `blueutil --connect 80-aa-1c-19-61-c1` | Phone Meta AI owns the bond |
| Pair Ray-Ban Meta in macOS Bluetooth | `node tools/meta-glasses-hermes-bridge.js --phone-only` |
| Treat Mac audio SCO as the companion path | `HERMES_GLASSES_PHONE_ONLY` default on (set `=0` only for explicit Mac audio debug) |

```bash
node tools/meta-glasses-hermes-bridge.js --status
node tools/meta-glasses-hermes-bridge.js --phone-only
node tools/meta-glasses-hermes-bridge.js --openclaw-status
node tools/meta-glasses-hermes-bridge.js --email
node tools/meta-glasses-hermes-bridge.js --capabilities
node tools/meta-glasses-hermes-bridge.js --ask "what's in my inbox"
```

## HARD: Gmail vs "email is not connected"

Hey Meta looking at the phone Gmail app still says **email is not connected** until **Meta AI → hamburger → Settings → Apps → Connect Gmail** (Accounts Center OAuth as `iganapolsky@gmail.com`). That is Meta's closed connector.

Hermes Gmail (`~/.hermes/google_token.json`) **is** connected: `--email` reads `iganapolsky@gmail.com`. Do not hang up an in-call screen to finish Meta OAuth — wait until idle, then Settings → Apps.

## Maximize autonomy (Aug 2026 honesty)

| Layer | What actually wires |
|-------|---------------------|
| Hey Meta / Muse Spark | Closed Meta AI. Apps/Calendar/Gmail only via Meta Settings → Apps |
| Phone BT | Meta AI companion only (phone-only policy) |
| Hermes bridge | LiteLLM :4010 (glm-5.3, vision-gemini, muse-spark, …) + Ollama + `--email` + `--openclaw` |
| OpenClaw MCP :8766 | glasses_capture, it_diagnose_hardware, it_analyze_incident, it_system_voice_hud, send_message |
| DAT / VisionClaw-style | Third-party camera+Gemini overlay; needs Meta AI Developer Mode + DAT SDK — not Hey Meta |
| Android XR Projected | Hermes native-glasses scaffold — not Ray-Ban Meta display |

Never claim Hey Meta runs Hermes MCPs. Route "look at my email" to Hermes `--ask`/`--email` until Meta Apps Gmail OAuth is on.

If glasses keep "trying to connect to MacBook Pro": Mac residual bond or glasses multi-point memory. Run `--phone-only`, confirm macOS Bluetooth has no RB Meta pair, keep Meta AI Device connected on the phone.

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
