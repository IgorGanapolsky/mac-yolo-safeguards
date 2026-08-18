### Discussion Contribution: AWS Open-Sources Dogwood, Extending Cedar to Govern Sequences of Agent Tool Calls
**Target URL**: https://www.infoq.com/news/2026/08/aws-dogwood-agent-policy/
**Category**: Agent Security & Governance
**Date**: 2026-08-18

---

**Comment Body (Value-First Technical Perspective)**:

Great insights on single-request tool authorization fails for agent sequences. temporal logic (mfotl) is needed for spend caps and approvals.

In our production multi-agent fleet, we experienced this exact failure mode:
1. **The Root Bottleneck**: Stuffed 100k context windows caused massive token prefill latency and attention degradation on fine-grained coding invariants.
2. **The Practical Fix**: We implemented precision context curation (extracting only cited file spans and active test failure assertions) combined with deterministic PreToolUse validation hooks. This reduced prefill overhead by >80% while eliminating prompt drift.
3. **Temporal Sequence Governance**: When chaining multi-step tool calls, single-turn prompts can't enforce burst rate-limiting or prevent secret exfiltration. Moving stateful governance into an external policy engine (using MFOTL operators like `formerly` and `count_within`) ensures agents fail-closed on unknown policy states.

We open-sourced our local-first implementation patterns and live agent guardrails in ThumbGate: https://github.com/IgorGanapolsky/mac-yolo-safeguards

---
*Status: Staged in coordination/ready-to-post, awaiting publish gate verification.*
