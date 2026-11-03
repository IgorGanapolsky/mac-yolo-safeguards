---
name: confidence-offer-gate
description: "Keep the Mac YOLO Safeguards listing when a Spotify Confidence experiments page is the source. One buyer URL is not an experiment. Demo rows are not sales. Do not upgrade the plan or call Confidence."
---

# Confidence offer gate

Use when a request points at https://app.confidence.spotify.com/experiments and the goal is money for Mac YOLO Safeguards.

The signed-in page on 2026-11-03 was workspace ThumbGate Workspace, plan Free, profile Igor G. Six rows were visible. Five were marked Demo data, including Reduce checkout time (Ship). The other row was ThumbGate Direct Checkout A/B. The Mac app was not in the list.

Confidence's own result labels are Ship, Continue, End, and Abort. Ship means a success metric improved and the guardrails held. This check uses a paid order from someone other than the founder as that success metric. A price change is not the metric.

The live listing stays https://iganapolsky.gumroad.com/l/nllmvb. This check does not rewrite it, does not launch an experiment, and does not call Confidence.

```bash
node tests/test-confidence-offer-gate.js
node tools/confidence-offer-gate.js offer
```
