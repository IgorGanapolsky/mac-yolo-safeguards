# IA-before-AI executive qualification gate

`tools/ia-before-ai-executive-gate.js` converts three external ideas into one deterministic revenue handoff:

- [AI Agents Summit](https://events.aiunleashedglobalsummit.com/aias-registration-yt): connect lead generation to sales through an explicit typed handoff instead of disconnected “agents.”
- [The Trillion-Dollar AI Opportunity Nobody Is Talking About](https://music.youtube.com/watch?v=LQXFpzoP8es): qualify infrastructure architecture before adding AI.
- [It's Not a Skill Problem, It's an Identity Problem](https://music.youtube.com/watch?v=lOjC4o02bT0): approach executive buyers with a material business hypothesis and one evidence-seeking question, not generic AI-agent copy.

## Business use

Run this before making a new AI-infrastructure paid ask. It refuses generic interest unless the prospect has:

1. one live workflow;
2. one repeated failure;
3. a measurable business cost or risk; and
4. shareable evidence.

The output is a recommendation only. The tool has no network client, never sends a message, never creates checkout, and never mutates a customer system. Existing platform dedup and payment gates remain authoritative.

## Infrastructure readiness

The gate scores seven pillars:

1. data inventory;
2. identity and access;
3. deterministic workflow boundaries;
4. retry and idempotency controls;
5. evaluation cases;
6. observability; and
7. human approval.

Missing any critical pillar—data inventory, identity/access, deterministic workflow, retry/idempotency, or human approval—caps the route at the existing `$499` diagnostic. The `$1,500` hardening sprint requires all critical pillars and a qualification score of at least 6/10. The `$3,000` partner pilot requires at least 9/10 and all seven pillars.

## Input

The CLI accepts one strict JSON object from a file or stdin. Missing, unknown, or wrong-type fields fail closed. Text control characters are rejected, and CLI error output escapes control characters before writing to a terminal or log.

```json
{
  "company": "Acme Support",
  "executiveRole": "CTO",
  "businessPriority": "reduce failed customer handoffs",
  "repeatedFailure": "agent retries create duplicate CRM updates",
  "businessCostUsd": 12000,
  "usesAgentsWeekly": true,
  "budgetOwner": false,
  "canShareEvidence": true,
  "needsRepeatability": true,
  "liveWorkflow": true,
  "infrastructure": {
    "dataInventory": true,
    "identityAccess": true,
    "deterministicWorkflow": true,
    "retryIdempotency": true,
    "evaluationCases": true,
    "observability": true,
    "humanApproval": true
  }
}
```

```bash
node tools/ia-before-ai-executive-gate.js --input opportunity.json --json
```

The result contains the qualification score, IA readiness gaps, offer route, executive hypothesis, evidence question, paid ask, provenance, and explicit `false` side-effect flags.

## Revenue truth

A qualified route is not revenue. Count only provider-backed external payment for the correct offer. A generated hypothesis, recommendation, checkout link, message, or accepted scope is not payment.
