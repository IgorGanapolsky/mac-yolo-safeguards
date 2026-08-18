---
name: startup-application-helper
description: >
  Generates startup application content with Truth Guardrails.
  Maps product value prop to funding opportunity requirements. Use for
  startup, funding, or grant applications.
---

# Startup Application Helper

## Purpose

Generate funding/grant application content mapped to specific opportunities.
Outputs DRAFT_ONLY material with verification requirements.

## Usage

```bash
# Generate application framework
node tools/startup-app-generator.js "claude-for-startups" --framework

# Verify all claims before submit
bins/verify-opportunity.sh "funding-application"

# Generate customized content
node tools/startup-app-generator.js "opportunity-name" --content --verify
```

## Workflow

1. **Input** - Provide opportunity name
2. **Research** - Fetch opportunity details
3. **Map** - Product → Opportunity alignment
4. **Verify** - All claims against live sources
5. **Output** - DRAFT application content

## Product Value Props

| Product | Claim | Guardrail |
|---------|-------|-----------|
| ThumbGate.app | AI agent control plane | 0 customers verified |
| Leash | FREE approvals forever | Never paywall |
| Continuity | VPS failover | $10/mo verified |

## Truth Guardrails

- ThumbGate.app has ~0 paying customers (4 orgs only)
- Leash FREE forever (standing decision)
- Continuity $10/mo (verified in production)
- NEVER claim fabricated user numbers

## Integration Points

- `docs/CLaude-Startup-Application-Framework.md` - Full template
- `docs/` - Opportunity-specific docs
- Routes: /go/android, /go/ios for mobile

## Verification Required

Before any application submission:
- [ ] thumbgate.app HTTP 200
- [ ] Pricing $10/mo Continuity
- [ ] Store links 302 redirect
- [ ] No fake customer claims
