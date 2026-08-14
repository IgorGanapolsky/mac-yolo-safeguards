---
name: outcome-owned-agent-pattern
description: >
  Grok Bot–style outcome ownership for Hermes/Grok multi-agent fleet: named
  roles, draft-first boundaries, skill→test→routine ladder, narrow event
  triggers, no-stale-data. Source: https://docs.x.ai/grok-bot/overview
  (2026-08 steal). Trigger: steal grok bot ideas, bot charter, skill then
  routine, draft first automation, outcome-owned agent, teach a task.
  Slash: /outcome-owned-agent-pattern.
---

# Outcome-owned agent pattern (steal from Grok Bot)

Canonical product docs: [Grok Bot overview](https://docs.x.ai/grok-bot/overview),
[skills & routines](https://docs.x.ai/grok-bot/skills-routines-and-automations),
[approvals](https://docs.x.ai/grok-bot/approvals-security-and-privacy),
[use cases](https://docs.x.ai/grok-bot/use-cases).

This skill maps those ideas onto **our** fleet (Hermes, Grok Build, Cursor,
Grok Bot desktop, LaunchAgents) — not a reimplementation of their cloud VM.

## Steal matrix (high ROI only)

| Grok Bot idea | Do this here | Do not |
|---------------|--------------|--------|
| Bot owns a **repeatable outcome** | One charter per role (job + systems + format + stop rules) | Vague “help with coding” agents |
| **Draft / prepare first** | Every outbound, publish, spend, prod change stops at draft | Auto-send “to be helpful” |
| **Task → skill → test → routine** | One live success, save method, second input test, then schedule | Schedule on first try |
| **Narrow event triggers** | Phrase + ticket link / label match | “Every Slack message” |
| **Missing/stale data = fail loud** | Report source failure; refetch; never invent | Silent empty or yesterday’s cache as truth |
| **Prefer connectors/API** | `gh`, Gmail API, Linear, Stripe CLI | Hijack Igor’s Chrome (ban) |
| **Shared computer ≠ security boundary** | Assume shared sessions across fleet bots | Separate bots as isolation |
| **Human for secrets/2FA** | Secure handoff / Keychain / take-over | Passwords in chat |
| **Auto-review style gates** | Require approval on send/spend/delete/force-push/prod | Broad “always allow browser” |
| **Test run is real work** | Safe inputs; write actions still gated | Enable routine untested |

## Ladder (mandatory order)

1. **One real task** with explicit stop boundary in the prompt.
2. **Correct until reviewable** (sources, format, gates).
3. **Save as skill** (six fields — see validator).
4. **Second input test**.
5. **Routine only when** missing-source + stale-data + partial-completion policies exist.
6. **Consequential actions stay behind approval** forever unless Igor widens the gate.

## Skill template (six fields)

1. When to use  
2. Required inputs + access  
3. Sequence of work  
4. How to validate  
5. What to return  
6. What requires approval  

## Routine template (trust design)

- Owning bot/agent  
- Schedule **or** narrow event matcher + timezone  
- Input source (live refetch)  
- Skill name  
- Expected result  
- Approval boundary  
- Missing-source policy (fail/report, no invent)  
- Stale-data policy (refetch / max-age)  
- Partial completion report  
- Test-run required before enable  

## Validator

```bash
node tools/outcome-routine-spec.js example
node tools/outcome-routine-spec.js validate path/to/spec.json
node tools/outcome-routine-spec.js self-test
node tests/test-outcome-routine-spec.js
```

## Fleet charters (defaults)

| Role | Outcome | Hard stop |
|------|---------|-----------|
| Chief / orchestrator | Source-linked daily watch list | No outbound send |
| QA | Repro packs as brand-new user | No ship claim without tests+E2E |
| Ship | Own PR green + merge discipline | No other-agent force-merge |
| Inbox | Reply **drafts** only | Never send |
| Revenue | AHLS $149 **drafts** only | No dispatch without CEO auth |
| Icebreaker | Social drafts | Never post; Hashnode frozen |

Grok Bot product setup: `/grok-bot-autonomy`.

## Anti-patterns (expensive)

- Automating execution before preparation is reliable  
- Broad listeners that burn tokens and act on noise  
- Treating separate agent names as security isolation  
- Reusing stale metrics/pipeline rows without refetch  
- “Always allow” rules that match entire browsers  
