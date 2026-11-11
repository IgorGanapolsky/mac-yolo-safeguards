---
name: mckinsey-ai-coding-steal
description: "McKinsey AI Coding Operating System steal (https://www.youtube.com/watch?v=21tuT-e4NVo): 1-2 day Kanban & Night-Shift loops, strict standardized PRD validator, progressive autonomy pullback, 2-4 agent mini-pod role collapse (Definer/Builder/Reviewer), golden examples + tribal knowledge semantic layer, baked-in sideways enterprise guardrails (WCAG AA contrast/colorblind/DLP/$10 cap), and Token ROI AIOps scoring."
---

# McKinsey AI Coding Operating System (`mckinsey-ai-coding-steal`)

Operationalizes the 5 pillars from McKinsey's *"What the Top Companies Do Differently With AI Coding"* (`https://www.youtube.com/watch?v=21tuT-e4NVo` — Martin Harrysson, Prakhar Dixit, Shilpa):

1. **Redesign Operating Model & Delivery Flow**:
   - Replace 2-week sprints with **1–2 day Kanban & Night-Shift loops** (`buildNightShiftKanbanPlan`).
   - Enforce a strict predefined PRD/spec input schema (`validateStandardPrd`) so agents never burn tokens on fragmented requirements.
   - Progressively pull back human-in-the-loop sign-offs (`evaluateProgressiveAutonomy`) as consecutive green runs grow (`tier0_unproven` -> `tier1_validated` -> `tier2_trusted_night_shift`), while keeping `irreversibleAlwaysGate` actions fail-closed.
2. **Restructure Teams & Roles**:
   - Bound mini-pods to **2–4 agents/people** (`maxConcurrentAgentsPerRepo: 3`) and collapse roles into **Definer** (PM + Spec), **Builder** (Dev + QA), and **Reviewer** (Adversarial Validation) (`evaluateMiniPodStructure`).
   - Enforce review-first parity (`reviewRatio >= 1.0`).
3. **Curate Context, Golden Examples & Skills**:
   - Expose tenured SME tribal knowledge and top-tier **Golden Examples** (not codebase averages) alongside a tight vetted skill allowlist (`getGoldenExamplesAndTribalKnowledge`).
4. **Eliminate Upstream, Downstream & Sideways Bottlenecks**:
   - Bake security/DLP (`CORP_AIRGAP_RE`), `$10/mo` FinOps compliance, and design/accessibility rules (WCAG AA contrast $\ge 4.5:1$, colorblind safety, $\ge 44\text{px}$ tap targets, `:focus-visible`) directly into automated pre-flight checks (`runSidewaysGuardrailsGate`).
5. **Track Token ROI & Value (AIOps)**:
   - Score feature business impact vs token spend (`scoreTaskTokenRoi`) and emit vendor-neutral OpenTelemetry (`otel`) spans to `~/.paperclip/operations/telemetry/otel_spans.jsonl`.

```bash
node tests/test-mckinsey-ai-coding-steal.js
node tools/mckinsey-ai-coding-steal.js doctor --json
node tools/mckinsey-ai-coding-steal.js golden
node tools/mckinsey-ai-coding-steal.js sideways-gate
node tools/mckinsey-ai-coding-steal.js score-roi
```
