---
name: velodb-personalize-gate
description: "Keep a VeloDB personalize choice as a label. Do not start the trial, add a database, or record a vendor speed figure."
---

# VeloDB personalize gate

Use when a request points at https://www.velodb.cloud/personalize or the Towards Data Science note in Downloads/datascience.pdf.

On 2026-11-03 the signed-in page heading was "Let’s personalize your experience." Four choices were on the menu: Real-time Analytics, Observability, RAG and GenAI, and Lakehouse. Continue was not pressed. The newsletter says fresh data and flexible search without adding more systems, and its free-trial link was not opened.

A choice from that menu is a label. This check does not start a trial, add a database, or call VeloDB. A speed or relevance figure from the vendor is refused.

```bash
node tests/test-velodb-personalize-gate.js
node tools/velodb-personalize-gate.js label --workload "Real-time Analytics"
```
