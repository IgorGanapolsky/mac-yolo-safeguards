---
name: modal-cloud-harness
description: Automated Modal (modal.com) serverless cloud setup, GPU inference deployment, cloud E2E runner offloading, and BrowserOS SSO auto-authentication for AI coding agents.
---

# Modal Cloud Harness & Serverless GPU Deployment Skill

Use this skill whenever an agent needs to execute serverless Python code, offload 24-minute Android/iOS emulator E2E tests, deploy GPU inference models (DeepSeek, GLM, Qwen), or manage Modal cloud sandboxes without human intervention.

## Core Capabilities & Directives

### 1. Automated Modal Setup & Authentication
- **Token Location**: Modal authentication tokens are stored in macOS Keychain or environment variables `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.
- **BrowserOS SSO Integration**: When Modal SSO login is needed, use BrowserOS Neo (`browseros-neo` MCP server) to navigate to `https://modal.com/settings/tokens` using `iganapolsky@gmail.com`.
- **Verification**: Run `python3 -m modal profile list` or `node tools/modal-auto-provisioner.js --status` to confirm active cloud session.

### 2. Cloud E2E Test Offloading
- Offloads heavy Android emulator or headless Chrome E2E runs to Modal cloud sandboxes.
- Run `python3 tools/modal-agent-sandbox-harness.py --check` for active container state.

### 3. Serverless GPU Inference
- Deploys scale-to-zero vLLM / LiteLLM serverless endpoints on A10G/H100 GPUs with sub-10ms response times.
- Integrates directly with `hermes-yolo` and `jcode-yolo`.

---
*Maintained by Antigravity AI Operations Council — August 2026*
