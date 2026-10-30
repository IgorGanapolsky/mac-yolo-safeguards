---
name: ultramarine-flash-route
description: "Fail-closed route for Paper Instruments Ultramarine 1 Flash knowledge work. Uses the Paper Instruments API, then Fireworks, then a Baseten deployment URL. Does not download the Hugging Face weights."
---

# Ultramarine 1 Flash route

Use this when a task is knowledge work (a memo, workbook, earnings note, diligence pack, or operations write-up) and a hosted sparse model should be tried before a larger frontier call.

The weights stay at `paperinstruments/Ultramarine-1-Flash`. The model card says 320B total parameters, 18B active, and a 1,048,576-token context. Their own training table and the Feather harness compact at 131,072 tokens. This route does not download the weights. The published local serve command needs four datacenter GPUs.

## Order

1. Paper Instruments `https://api.paperinstruments.com/v1/chat/completions`, model `ultramarine-1-flash`, when `PAPERINSTRUMENTS_API_KEY` is set.
2. Fireworks `accounts/fireworks/models/ultramarine-1-flash-us`, when `FIREWORKS_API_KEY` is set.
3. Baseten only when `BASETEN_API_KEY` and `BASETEN_ULTRAMARINE_BASE_URL` (https) are both set. The library page is a deploy button, not a call address.

Sampling on a real chat call is temperature 1, top_p 0.95, reasoning effort max, and at least 32,768 completion tokens. `top_k` is omitted. Their published per-million rates stay on the provider record with the page they came from. A vendor benchmark is not a measurement this route made.

## Commands

```bash
node tools/ultramarine-flash-route.js --status
node tools/ultramarine-flash-route.js --route --task "Reconcile the quarterly earnings memo"
node tests/test-ultramarine-flash-route.js
```

`--status` exits 2 when no provider credential is present. It does not send a completion. `--call` also exits 2 until a credential exists.
