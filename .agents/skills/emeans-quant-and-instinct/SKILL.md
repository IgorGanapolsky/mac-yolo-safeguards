---
name: emeans-quant-and-instinct
description: Operationalizes Meta FAIR e-means clustering (arXiv:2611.09501), @shinboson's e-means codebook quantization compiler regime, Google DeepMind's Gemini Decisions API (gemini-decision-1 single-pass noul/choice/score control plane), and the single-target WhatsApp Instinct copilot driver for mac-yolo-safeguards.
---

# e-means Quantization, Gemini Decisions API & WhatsApp Instinct Driver (`emeans-quant-and-instinct`)

## Overview

1. **Meta FAIR `e-means` Clustering (`tools/emeans-quant-router.js`)**:
   - Replaces full-batch Lloyd's k-means with mini-batch Exponential Moving Average (EMA) updates ($S_j \leftarrow (1-\alpha)S_j + \alpha s_j$, $N_j \leftarrow (1-\alpha)N_j + \alpha n_j$, $c_j = S_j / N_j$).
   - Uses zero-hyperparameter scaling laws from $(n, k, T)$ (including the $c_B / 8$ rule when $n > 2{,}000{,}000$), cosine step annealing ($\alpha_0 \to 0.1\alpha_0$), batch-relative proportional-split dead-cluster revival, and exact last-epoch mean finalization.
2. **`@shinboson` Codebook Quantization Evaluator (`evaluateCodebookQuantizationTier`)**:
   - Models `e-means` codebook generation compressing `Qwen3.5-4B` from `8.41 GB` to an estimated `1.23 GB` (`6.84x` compression, `~2.46 bpw`) with an estimated `91.9%` retained benchmark quality, estimating whether the quantized footprint fits comfortably inside available Apple Silicon unified memory to reduce `WindowServer` swap-freeze risk.
3. **Google DeepMind Gemini Decisions API Control Plane (`tools/gemini-decisions-engine.js`)**:
   - Operationalizes `gemini-decision-1` (`https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/`) to evaluate up to `1,000` closed-set questions (`noul`, `choice`, and ordered rubric `score`) in a single forward pass (`150-250 ms`, `$0.10 / 1M` input tokens, `$0.00` output tokens).
   - Powers `evaluatePreActionDecisionPack` (ThumbGate pre-action interdiction + calibrated confidence escalation to mobile approval) and `evaluateCommercialOpportunityBatch` (single-pass qualification of empirical macOS freeze incidents and non-dilutive startup credits).
4. **WhatsApp Instinct Copilot Driver (`tools/whatsapp-instinct-driver.js`)**:
   - Hard-locked exclusively to the `INSTINCT_PHONE` / `INSTINCT_JID` (`ZCHATSESSION = 3`) session constants and `PRODUCT_ID = 'mac-yolo-safeguards'`.
   - Refuses any non-Instinct WhatsApp contact (`ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN`), refuses cross-product mixing (`ERR_CROSS_PRODUCT_MIX_FORBIDDEN`), and refuses any external outreach instruction (`ERR_EXTERNAL_OUTREACH_FORBIDDEN`).

## Verification

```bash
node --test tests/test-emeans-quant-and-instinct.js
node tools/emeans-quant-router.js
node tools/gemini-decisions-engine.js
node tools/whatsapp-instinct-driver.js
```
