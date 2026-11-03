---
name: ultramarine-and-android-summit-26-steals
description: "Use when routing knowledge-work/document/coding tasks via Paper Instruments Ultramarine 1 Flash (320B-A18B MoE, 1M context, $0.13/task = 98% cheaper than Fable 5, Hugging Face / Fireworks / Baseten) or applying Google Android Dev Summit '26 agent patterns (BYOA, Emulator-Free Compose/UI Previews for 77% faster UI tasks & 3x fewer tokens, 30+ Android skills for 1.9x speed & 1.3x token savings, Lightbuild, and Pre-Commit AI Change Review)."
---

# Paper Instruments `Ultramarine 1 Flash` + `Android Dev Summit '26` Steals

Distilled from:
1. **Paper Instruments — `Ultramarine 1 Flash`** (`Screenshot 2026-10-30 at 10.16.35 AM.png` & `https://www.paperinstruments.com/ultramarine`):
   - **Architecture**: `320B` total parameters, `18B` active (`5.625%` sparsity MoE), `1M` token context window, open weights on Hugging Face (`paperinstruments/Ultramarine-1-Flash-LoRA`).
   - **Economics**: `$0.15/M` input · `$0.03/M` cached input · `$0.50/M` output · **`-6.5%` fewer output tokens** than GLM-5.3 Flash · **`$0.13/task` vs `$8.19/task` on Claude Fable 5 (`98.4%` lower cost)** with higher PI Knowledge Work score (`59.3` vs `57.8`).
   - **Failover**: `ultramarine-api` $\rightarrow$ `fireworks/ultramarine-1-flash-us` $\rightarrow$ `baseten/ultramarine-1-flash` $\rightarrow$ `huggingface-local`.
   - **Client-Readiness Rubric**: Evaluates outputs on **Substance**, **Reconciliation/Accuracy** (every subtotal and total reconciling), and **Restrained Presentation** (zero emoji slop).
2. **Google `Android Dev Summit '26`** (`/Users/iganapolsky/Downloads/Gmail - Android Dev Summit '26_ everything you need to know.pdf`):
   - **Emulator-Free UI Preview Gate (`77%` Faster, `3x` Fewer Tokens)**: Use Compose Previews / native `--self-test` & physical device streaming via CLI instead of booting heavy emulators.
   - **Domain Skill Multiplier (`1.9x` Faster, `1.3x` Fewer Tokens)**: Always load domain skills before agent execution across Antigravity, Claude Code, Codex, and OMP.
   - **Pre-Commit AI Change Review & Lightbuild**: Catch regressions before `git commit`.

## Quick Commands

```bash
node tools/ultramarine-and-android-summit-26-steals.js
node tests/test-ultramarine-and-android-summit-26-steals.js
```
