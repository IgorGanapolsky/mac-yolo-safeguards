# 2026-08-10 PM — final social copy (frozen, ready to paste)

**Campaign:** `2026-08-10-pm`
**Persona:** DevOps / platform engineer
**Pain:** Approval fatigue — the reviewer is present and attentive and *still* misses it, because volume destroys signal
**Meme concept (30-day dedup key):** `worn-approve-pristine-deny` — console close-up, APPROVE button worn to bare metal with a finger-groove hollowed in it; DENY dust-covered, cobwebbed, still taped shut. Asset: `docs/social/assets/2026-08-10-pm-worn-approve-button.png` (2752×1536, original, Gamma)
**Longform:** `docs/social/drafts/2026-08-10-pm-approval-fatigue-longform.md`

## Differentiation from THIS MORNING's run (PR #1595, campaign `2026-08-10-am`) — required check

| | AM run | This PM run |
|---|---|---|
| Persona | Mac operator away from desk | **DevOps / platform engineer** |
| Pain | Destructive action runs because **nobody was watching** | **Someone *was* watching and still missed it** (inverse) |
| Evidence | HN 47911524 (PocketOS 9-second prod DB delete) | **HN 49195468** (permission-game study, 409k decisions) |
| Hook | "…deleted a production database in 9 seconds. Nobody was watching." | **Pager/alert-fatigue parallel** |
| Meme | Sleeping dev + 2am approve/deny push (not generated) | **Worn APPROVE / dusty DENY buttons** (generated) |

No overlap on persona, pain, hook, or meme. Channels are the same set only because none of them published.

## Verified live 2026-08-10

Continuity **$10/mo** (`/api/billing/plan` → unitAmount=1000, usd, month) · iOS **$4.99, 0 ratings** (iTunes lookup 6786778037) · thumbgate.app, /go/android, /go/ios, thumbgate.ai all **HTTP 200** · HN item 49195468 posted **2026-08-06** (~40,000 plays, ~409,000 decisions, ~1 in 3 threats missed).

**Dropped claim:** the thread's point/comment counts could not be reconfirmed on re-fetch (items API returned null points), so no engagement figure appears in any copy below.

**Guardrails applied:** Leash approve/deny described as free on web and mobile, never priced. Continuity price read live this run. No traction, user-count, or revenue claim. No affiliation claims. Study described as 2026-08-06, never "today."

---

## LinkedIn — operator story (hero CTA in the FIRST COMMENT, not the body)

**Body:**

If you've carried a pager, you already know how this ends.

You alert on everything, because everything might matter. A month later it fires forty times a night, thirty-nine are noise, and the on-call engineer has a reflex: silence, glance, back to sleep. Then the real outage shows up dressed like the noise, and gets silenced too.

We didn't conclude that on-call engineers were careless. We concluded — about fifteen years ago — that an alert channel with bad signal-to-noise doesn't degrade gracefully. It inverts. Past a certain volume, more alerts make you *less* likely to catch the thing you're alerting on. That's where alert budgets and symptom-based paging came from.

We are now rebuilding that exact failure inside AI agent approval prompts.

A permission-game study from 2026-08-06 ran ~409,000 approve/deny decisions past people who had been warned in advance that dangerous commands were in the mix. Roughly one in three real threats got approved anyway.

Score a typical agent approval flow against the alerting playbook:

→ Page only on actionable conditions — no, it prompts on everything in the risky class
→ Symptoms, not raw causes — no, it shows a command string, not what the command does
→ Runbook in the alert — no context on blast radius or reversibility
→ Respect an alert budget — unbounded
→ Never make silence the cheap default — it blocks progress, which makes approve the cheap default

Five for five on the anti-pattern. Then we measured it and started debating whether humans are any good at this.

The last one does the most damage. When the pending call is holding up the work — worse, when the session dies if you don't answer — you haven't asked for a decision. You've set a deadline. Deadlines produce reflexes.

I build one of these gates, so this is a critique of my own category. The approve/deny part is free and stays free; I'm not charging for the thing that stops the bad outcome. Computed blast radius is still my weakest surface and I'd rather name that than let it be discovered. And the reason I care so much about work surviving a closed laptop is that a gate which can't afford to wait is just a timed exam.

#DevOps #AIAgents #AISafety

**FIRST COMMENT (post immediately after; verify it renders before marking Published):**

Free web control plane, no install, pairs over outbound HTTPS: https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-08-10-pm

Also on your phone — Android https://thumbgate.app/go/android · iOS https://thumbgate.app/go/ios (paid apps; the web gate is free)

Study thread: https://news.ycombinator.com/item?id=49195468

**Image:** meme optional here (formal operator story is meme-exempt per engine §5).

---

## X — 280 char limit (attach meme)

We solved this once already with pagers: past a certain volume, more alerts make you *less* likely to catch the real one.

~409,000 agent approve/deny decisions studied. ~1 in 3 real threats approved anyway.

https://thumbgate.app/?utm_source=x&utm_medium=social&utm_campaign=2026-08-10-pm

#DevOps #AIAgents

---

## Bluesky — 300 char limit (attach meme)

Alert fatigue taught us that a noisy channel doesn't degrade gracefully — it inverts.

~409,000 agent approval decisions studied; ~1 in 3 real threats got approved.

Unbounded prompts that block progress make "approve" the cheap default.

https://thumbgate.app/?utm_source=bluesky&utm_medium=social&utm_campaign=2026-08-10-pm

#DevOps #AISafety

---

## Threads — 500 char limit (attach meme)

If you've carried a pager you know this one. Alert on everything, and within a month the on-call reflex is silence-glance-sleep — so the real outage gets silenced too.

We're rebuilding that failure in AI agent approval prompts. A 2026-08-06 study of ~409,000 approve/deny decisions found ~1 in 3 real threats approved anyway.

Unbounded, blocking, shows a command instead of a consequence. Approve becomes the cheap default.

https://thumbgate.app/?utm_source=threads&utm_medium=social&utm_campaign=2026-08-10-pm

#DevOps #AIAgents #AISafety

---

## dev.to — longform (4 tags)

**Title:** We already learned this with pagers. We're relearning it with agent approvals.
**Tags:** `devops`, `ai`, `security`, `sre`
**Body:** full text of `docs/social/drafts/2026-08-10-pm-approval-fatigue-longform.md`
**Cover image:** `docs/social/assets/2026-08-10-pm-worn-approve-button.png`
**Canonical:** dev.to is canonical.

---

## Medium — longform cross-post (3–5 tags)

**Title:** We already learned this with pagers. We're relearning it with agent approvals.
**Tags:** `DevOps`, `AI`, `Security`, `SRE`, `AI Agents`
**Body:** same longform text
**Canonical URL:** set to the dev.to URL once dev.to publishes first.

---

## Skool — community-first (lead with the insight; link only if it answers the thread)

For an agent-safety or HITL-design thread:

The permission-game study going around (~409k approve/deny decisions, ~1 in 3 real threats approved) keeps getting read as "human-in-the-loop doesn't work." I think it's better read as alert fatigue with a new coat of paint.

The alerting playbook ports over almost directly:
1. Approval budget — thirty prompts in a session is a policy bug, not diligence
2. Symptom over cause — show what changes, not the command string; people are bad parsers, good judges
3. Runbook in the prompt — what rule fired, what the agent was trying to do
4. Make "not now" free — otherwise people approve to avoid losing the work
5. Decouple the decision from the clock — a gate that can't afford to wait is a timed exam

Disclosure: I build a gate like this, so #2 is me criticising my own weakest surface.

---

## Reddit — NOT posting

Standing hard ban on promo. A genuine technical comment would qualify only as an original reply with build-disclosure in a sub that permits it. None posted this run.
