# RESEARCH — ThumbGate Continuity (paid VPS failover) — July 2026

**Status:** decision-grade  
**Date:** 2026-07-23  
**Deep research run_id:** `trun_56512285d81d4929aaccf642c6b6234a`  
**Processor:** `pro-fast`  
**Raw outputs:**  
- `parallel-research/thumbgate-continuity-vps-july-2026.md`  
- `parallel-research/thumbgate-continuity-vps-july-2026.json`  
**Interaction (follow-ups):** `--previous-interaction-id trun_56512285d81d4929aaccf642c6b6234a`

---

## Executive verdict

**Continuity is a real white-space SKU** (local Hermes + paid offline failover) against always-cloud agents ($20–$200 tiers) and pure local OSS (BYOK). ThumbGate’s **$10/mo** Continuity price is defensible if claims stay honest: **queued prompt/thread handoff to a fenced VPS runner**, not process migration.

**As of 2026-07-23 production evidence:** the VPS path **works** under live canaries. Product defaults historically blocked Continuity (manual offline policy); that is being fixed (auto default for paid, stale `local_pending` re-route).

| Question | Verdict |
|----------|---------|
| Is Continuity differentiated? | **Yes** — local-first + paid failover is uncrowded vs Cursor/Claude/Codex cloud-first and Aider/Cline local-only |
| Is $10/mo sane? | **Yes** — below $20 mass-market agent tiers; sell resilience, not tokens |
| Does VPS execution work in prod? | **Yes (proved live)** — see Primary evidence |
| Can we claim “always keeps agents running”? | **No** — canaries pass; 30-day SLO not yet; tool-gap is the UX risk |
| Build live process migration? | **No** until ≥100 paying users + liability posture |

---

## Primary evidence (our production, July 2026)

### Live infrastructure

| Component | State (2026-07-23) |
|-----------|-------------------|
| Stripe Continuity plan | `$10/mo`, configured + active |
| Control plane | `cloudRunnerConfigured: true`, 1 paid org |
| Fly runner | `igor-hermes-cloud-runner` deployed, health passing |
| Lease model | 90s fenced lease, generation + token, renew ~30s |

### Live canaries (same day)

| Task id | Path | Result |
|---------|------|--------|
| `canary_task_20260723_live1` | Direct `cloud_pending` → VPS | **`CONTINUITY-LIVE-OK-…` completed** (~9s) |
| `canary_local_stale_20260723_153919` | `local_pending` + **stale auto** device | **`CONTINUITY-STALE-AUTO-OK` completed** |
| Historical Jul 20 | Canary org | 3 completed cloud (`HEALTHCHECK`, `LEASH-*-OK`); 1 failed (model access) |

### Product bugs found and fixes

| Bug | Impact | Fix |
|-----|--------|-----|
| Default `failover_mode=manual` even for pro | Paid Continuity never auto-ran | Pairing defaults **auto** for pro/team/active trial; Stripe grant flips manual→auto |
| Online→offline stuck `local_pending` | Tasks never became cloud-visible | Claim path **reclassifies** stale local_pending (auto→cloud_pending, manual→needs_failover) |
| In-memory `lastTaskAt: 0` after redeploy | Looked like “never worked” | Treat as process-local; use D1 history + canaries for proof |

PR: `fix/continuity-auto-default-stale-reroute-20260723` (#887).

---

## Competitive landscape (July 2026 research)

Sources: Parallel deep research report (see raw `.md` for full citation list).

### Matrix (abridged)

| Product | Local primary? | Offline Mac failover SKU? | Entry price |
|---------|----------------|---------------------------|-------------|
| Cursor (Background Agent) | Editor + cloud agents | No (cloud-first) | ~$20/mo Pro |
| Claude Code | CLI on host | No | ~$20 Pro / higher Max |
| OpenAI Codex Cloud | CLI + cloud | Cloud is primary option | ChatGPT Plus/Pro |
| Devin / Factory | Cloud-first | Always cloud | ~$20+ usage |
| OpenHands Cloud | Self-host or SaaS | Optional cloud | Free tier / ~$20+ |
| Aider / Cline / Continue | Local + BYOK | No Continuity SKU | Free OSS |
| **ThumbGate Continuity** | **Hermes local + web** | **Yes — Fly VPS on offline** | **$0 web / $10 Continuity** |

**Takeaway:** Nobody in the mainstream coding-agent matrix sells **“Mac is primary; pay for offline continuation”** as a clean SKU. That is ThumbGate’s wedge.

---

## Pricing & unit economics

| Benchmark | Observation |
|-----------|-------------|
| Mass-market agent plans | Cluster ~**$20/mo**; power tiers $100–$200 |
| Continuity $10/mo | Below mass market; sell as **backup**, not primary compute |
| Caps trial 5 / pro 100 / 30d | Aligns with cost control; research estimates healthy margin if inference is bounded |
| Avoid | Per-token Continuity pricing (competes with Cursor Ultra narrative) |

**Internal rule:** charge for **resilience events** (cloud continuations), not for “more tokens.”

---

## Architecture verdicts

### Keep

1. **Queued handoff, not process migration** — honest and implementable.  
2. **90s fenced lease + generation + token** — matches industry ephemeral-sandbox thinking (E2B/Daytona/Firecracker-class isolation patterns).  
3. **Governance at admission + failover + claim** — policy 2026-07-22.1 style ceilings.  
4. **Auto vs manual offline policy** — user control; paid default auto after the fix.

### Do not build yet

- Live process/memory migration  
- Full Mac tool surface virtualization  
- “Always available / five-nines Continuity” marketing  

### Build next (priority)

1. **Tool registry** (`local_only` | `cloud_capable` | `equivalent`) — block silent tool-gap failures  
2. **Destructive ops gate** on cloud (rm, force-push, prod DB)  
3. **Public canary / SLO page** (last success, rolling success rate)  
4. **30 days of canary metrics** before stronger reliability language  
5. **ToS / AB 316 awareness** — no “AI acted alone” defense in CA; document allowlist ownership  

---

## Risks (decision-relevant)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Tool-gap (Mac-only tools in cloud) | **High UX churn** | Registry + bounce-to-Mac messaging |
| Overclaim reliability | Legal/trust | Stick to “eligible tasks”; publish canary stats |
| Destructive cloud actions | Liability | Confirm gates + audit trail |
| Entitlement bypass | Cost | Enforce at claim (already); keep caps server-side |
| Always-cloud competitors outspend | GTM | Own privacy/local-first narrative; don’t race Ultra tiers |

Research also flags **California AB 316 (2026)** style liability trends: defendants cannot shrug “the AI acted autonomously.” Treat Continuity as **our** execution surface legally.

---

## GTM: how to sell Continuity honestly

### Do say

- “Web dashboard for Hermes when your Mac is online.”  
- “Paid Continuity continues **eligible** threads on a **fenced VPS** when the Mac is offline.”  
- “Queued prompt handoff — not full process migration.”  
- “Auto or ask-first offline policy under your control.”  

### Do not say

- “Your agent never stops / seamless migration / same tools as Mac.”  
- “Guaranteed uptime” without a published SLO.  
- Firewall-lecture copy that buries Continuity (already rejected 2026-07-23).  

### Hero stack (product)

1. Hermes dashboard (free remote control)  
2. Continuity (paid VPS)  
3. Mobile store badges  
4. Phone↔Mac pairing diagram  

---

## July 2026 action checklist

| # | Action | Owner signal |
|---|--------|----------------|
| 1 | Merge/deploy Continuity auto-default + stale re-route (#887) | **done** 2026-07-23 |
| 2 | Keep pro devices on `failover_mode=auto` | Ops (done for owner workspace) |
| 3 | Weekly live canary + public status | **shipped** canary tool + `/api/continuity/status` |
| 4 | Tool-registry block `local_only` on cloud claim | **v0 shipped** `cloud-tool-policy` |
| 5 | Destructive tool gate for cloud completion | Eng |
| 6 | Status page: last canary, lastTaskAt, success rate | Eng |
| 7 | Landing copy audit vs anti-overclaim list | GTM |
| 8 | 30-day canary log before stronger reliability claims | GTM |
| 9 | No process-migration roadmap until revenue + insurance | Strategy |
| 10 | 3 design partners dogfooding offline Continuity | GTM |

---

## Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Price Continuity | Hold **$10/mo** | White-space under $20; resilience SKU |
| Continuity semantics | **Handoff**, not migration | Matches architecture + liability |
| Paid default offline policy | **Auto** | Paid users expect Continuity to fire |
| Process migration | **Defer** | Cost/legal vs margin |
| Proof standard | Live canary + D1 | Not unit tests alone |

---

## Sources

- Parallel deep research: `trun_56512285d81d4929aaccf642c6b6234a` → `parallel-research/thumbgate-continuity-vps-july-2026.md` (full citation list therein).  
- Primary: Fly `igor-hermes-cloud-runner` `/health`, D1 `tasks` cloud history, control-plane `/api/health`, live canaries 2026-07-23.  
- Internal: `docs/HERMES-CLOUD-FAILOVER.md`, governance policy 2026-07-22.1, ThumbGate RAG lessons (stale local_pending, claim-time evaluation).

## Follow-up research

```bash
parallel-cli research run "..." --previous-interaction-id trun_56512285d81d4929aaccf642c6b6234a
```
