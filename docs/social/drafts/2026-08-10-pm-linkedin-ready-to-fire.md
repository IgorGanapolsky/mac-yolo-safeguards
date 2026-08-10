# LinkedIn — 2026-08-10 PM, ready to fire

**Status:** frozen copy, verified claims, UTM in place. Fires automatically via
`execute_zapier_write_action` (`LinkedInCLIAPI` / `share`) the moment the OAuth connection
exists. No further input needed — this file is the payload, not a request.

**Persona:** DevOps / platform engineer
**Campaign:** `2026-08-10-pm`
**Meme:** `docs/social/assets/2026-08-10-pm-worn-approve-button.png` (worn APPROVE, cobwebbed DENY)

---

We solved this once already with pagers.

Past a certain volume, more alerts made you *less* likely to catch the real one. Nobody
concluded on-call engineers were careless. We concluded the channel was broken, and we fixed the
channel — alert budgets, symptom-based paging, runbooks in the alert body.

We are now rebuilding that exact failure in AI agent approval prompts.

A permission study published last week put ~409,000 approve/deny decisions in front of people
and told them up front that dangerous commands were mixed in.

Roughly 1 in 3 genuine threats got approved anyway.

Run the on-call diagnostic against a typical agent approval flow and it fails all five:

→ Prompts on every risky-class call, actionable or not
→ Shows a raw command, not what it will do
→ No blast radius, no reversibility, no runbook
→ Unbounded — a busy session throws dozens
→ Blocks progress until answered, which makes "approve" the cheap default

That last one does the most damage. When the session dies if you don't answer, you haven't
asked for a decision. You've imposed a deadline. Deadlines produce reflexes, and reflexes
produce that 1 in 3.

I build an approval gate. I wrote the long version as a critique of my own category, including
where my product scores badly against its own five criteria:

https://dev.to/igorganapolsky/we-already-learned-this-with-pagers-were-relearning-it-with-agent-approvals-54ka

If you've carried a pager, you already know how this ends. The question is whether we take the
fifteen years of lessons with us, or relearn them one incident at a time.

#DevOps #PlatformEngineering #AIAgents #SRE
