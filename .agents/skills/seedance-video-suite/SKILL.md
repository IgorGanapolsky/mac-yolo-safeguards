---
name: seedance-video-suite
description: >
  BytePlus Seedance 2.5 via seed-yolo: one official prompt, 30s cap, 50 multimodal
  refs, precision segment edit. Default STAGE_ONLY under $10/mo. Trigger: Seedance,
  Lumina, seed-yolo video, Broadway trapeze, BytePlus starter tokens.
---

# Seedance 2.5 on seed-yolo

Source: BytePlus email 2026-08-15 to iganapolsky@gmail.com (starter tokens).

```
seed-yolo video                 # official 30s Broadway trapeze prompt, STAGED
seed-yolo video "…" --aspect 9:16 --refs a.png,b.png
seed-yolo starter
seed-yolo revise JOB --time 12s-18s --prompt "hands glow"
seedance doctor --json
```

`--apply` is fail-closed (needs BYTEPLUS_API_KEY and remaining $10). No fake mp4 URIs.
