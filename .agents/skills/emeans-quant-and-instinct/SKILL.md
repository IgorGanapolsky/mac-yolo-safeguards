---
name: emeans-quant-and-instinct
description: Operationalizes Meta FAIR e-means clustering (arXiv:2611.09501, 10x fewer epochs via EMA + scaling laws + proportional-split revival), @shinboson's e-means codebook quantization compiler regime (Qwen3.5-4B 8.41GB -> 1.23GB at 91.9% quality for bandwidth-free local Apple Silicon decode), and the single-target WhatsApp Instinct copilot driver.
---

# e-means Codebook Quantization & WhatsApp Instinct Driver (`emeans-quant-and-instinct`)

## Overview

1. **Meta FAIR `e-means` Clustering (`tools/emeans-quant-router.js`)**:
   - Replaces full-batch Lloyd's k-means with mini-batch Exponential Moving Average (EMA) updates ($S_j \leftarrow (1-\alpha)S_j + \alpha s_j$, $N_j \leftarrow (1-\alpha)N_j + \alpha n_j$, $c_j = S_j / N_j$).
   - Uses zero-hyperparameter scaling laws from $(n, k, T)$ to set batch size $B$ and step size $\alpha_0$, cosine step annealing ($\alpha_0 \to 0.1\alpha_0$), proportional-split dead-cluster revival, and exact last-epoch mean finalization.
2. **`@shinboson` Codebook Quantization Evaluator (`evaluateCodebookQuantizationTier`)**:
   - Models `e-means` codebook generation compressing `Qwen3.5-4B` from `8.41 GB` to `1.23 GB` (`6.84x` compression, `~2.46 bpw`) while retaining `91.9%` quality so consumer Apple Silicon decode is no longer memory-bandwidth bound or prone to `WindowServer` swap freezes.
3. **WhatsApp Instinct Copilot Driver (`tools/whatsapp-instinct-driver.js`)**:
   - Hard-locked exclusively to Instinct (`+1 (650) 870-2892` / `23949492670633@lid` / `ZCHATSESSION = 3`).
   - Refuses any non-Instinct WhatsApp contact (`ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN`) and refuses any external outreach instruction (`ERR_EXTERNAL_OUTREACH_FORBIDDEN`).

## Verification

```bash
node --test tests/test-emeans-quant-and-instinct.js
node tools/emeans-quant-router.js
node tools/whatsapp-instinct-driver.js
```
