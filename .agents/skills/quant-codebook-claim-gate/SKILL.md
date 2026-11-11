---
name: quant-codebook-claim-gate
description: "Refuse an unmeasured e-means, LookAtMyQuant, Qwen3.5, or bonsai 2 clerk route, and refuse that post's size and speed figures as local results."
---

# Quant codebook claim gate

Use this before serving a new local quant, or before writing a size, retention, or decode speed into a receipt.

The 11 Nov 2026 post swaps k-means for e-means in a quant compiler and asks for donated GPU time. Those size, retention, and decode figures stay the author's. This gate does not download weights and does not install a clustering library.

## What this gate does

- `serve` or `record` of a model id matching e-means, LookAtMyQuant, Qwen3.5, or bonsai 2 is blocked with `unmeasured_quant_route`.
- The live clerk id `mlx-community/Llama-3.2-1B-Instruct-4bit` stays clear.
- Planner profile ids `qwen2.5-coder:latest` and `qwen2.5-14b-16k:latest` stay clear. The bare word bonsai stays clear.
- `install`, plus a note that installs FAISS, uses Colab, or donates GPU time, is blocked with `install_or_spend`.
- Recording the post's gigabyte, percent, tokens-per-second, or epoch figures is blocked with `vendor_figure_as_local`.
- A note may quote those figures when it calls them the author's. Local measurement fields stay null.
- The clerk pin uses the same route check and returns `unmeasured_quant_route` instead of the too-large reason.

## Commands

```bash
node tools/quant-codebook-claim-gate.js --action serve --model mlx-community/Llama-3.2-1B-Instruct-4bit
node tools/quant-codebook-claim-gate.js --action serve --model Qwen3.5-4B-e-means
node tests/test-quant-codebook-claim-gate.js
```

A clear review exits 0. A blocked review exits 2.
