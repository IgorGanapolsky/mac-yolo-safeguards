# 2026-08-06 PM — final social copy (frozen, ready to paste)

**Campaign:** `2026-08-06-pm`
**Persona:** Mac operator away from desk (last used: never in trailing 14 days — AM run used "Claude Code user")
**Pain:** Phone-approval decision fatigue — approving agent commands reflexively because the UI punishes deliberation
**Meme concept (30-day dedup key):** `approval-queue-47-deep-2am-thumb-blur` — half-asleep dev in bed, 47 identical APPROVE/DENY cards stacked, one red one buried mid-stack, thumb blurred mid-tap on the green APPROVE. Asset: `docs/social/assets/2026-08-06-pm-approval-fatigue.png` (2752x1536, generated original via Gamma, no trademarked template)
**Longform:** `docs/social/drafts/2026-08-06-pm-approval-fatigue-longform.md`

Verified live 2026-08-06: Continuity $10/mo (`/api/billing/plan` unitAmount=1000 usd/month) · iOS $4.99, 0 ratings (iTunes lookup 6786778037) · HN item 49195468 (230 pts, 180+ comments, posted today).

**Guardrail note:** Leash approve/deny is free on web and mobile — no copy below implies otherwise. No traction, user-count, or revenue claim appears anywhere. Continuity price was read live this run, never from memory.

---

## LinkedIn — operator story (hero CTA goes in the FIRST COMMENT, not the body)

**Body:**

A study hit the front page today: across ~409,000 decisions, people approving AI agent commands missed roughly 1 in 3 of the genuinely dangerous ones. They'd been warned in advance that dangerous ones were in the mix.

The top comment called the approval prompt what it often is — "a CYA click-thru so the vendor's lawyers can say you approved it."

I build an approval gate for coding agents. That comment is about my product, and I think it's largely fair.

Here's what I've had to sit with. Look at what an approval actually asks of someone:

→ It arrives unscheduled, while they're mid-something-else
→ It arrives dozens of times a session, and nearly all of them are safe
→ It shows a command, not a consequence
→ It blocks progress until answered
→ It gives them no way to say "not yet"

That isn't a test of judgment. It's a machine for manufacturing reflexive yes. The 1-in-3 miss rate isn't measuring careless people — it's measuring careful people put in a loop that punishes care.

The correction I keep coming back to: a gate that can't afford to wait isn't really a gate. If the session dies while you think — laptop sleeps, lease expires, context is gone — then every approval carries a hidden deadline, and deadlines are what produce the reflex.

So "keep the work alive while the human decides" stopped being a convenience feature in my head. It's load-bearing for the safety story.

Where that leaves my own build, honestly: the approve/deny gating is free and stays free — I'm not charging for the part that stops something bad. Showing consequence instead of raw command is still the weakest thing I ship. And the offline-handoff piece is real but early; the site says it's still proving out, and so do I.

Building this in public, including the parts the study just made harder to defend.

#AIAgents #DevTools #AISafety

**FIRST COMMENT (post immediately after, verify it renders):**

Free web control plane, no install, pair over outbound HTTPS: https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-08-06-pm

Also on your phone — Android https://thumbgate.app/go/android · iOS https://thumbgate.app/go/ios (paid apps; the web gate is free)

Study: https://news.ycombinator.com/item?id=49195468

**Image:** optional for LinkedIn (formal operator story is meme-exempt per engine §5). Attach `2026-08-06-pm-approval-fatigue.png` if a visual is wanted.

---

## X — 280 char limit (attach meme)

409,000 decisions studied. People approving AI agent commands missed ~1 in 3 of the dangerous ones.

Not because they're careless. Because a prompt that arrives 40x a session, shows a command instead of a consequence, and blocks progress until answered manufactures reflexive yes.

https://thumbgate.app/?utm_source=x&utm_medium=social&utm_campaign=2026-08-06-pm

#AIAgents #DevTools

*(char count: 279 incl. link as t.co 23 — verify before posting)*

---

## Bluesky — 300 char limit (attach meme)

409,000 approval decisions studied. Humans missed ~1 in 3 real threats.

A gate that can't afford to wait isn't a gate. If the session dies while you think, every approval has a hidden deadline — and deadlines produce reflexive yes.

https://thumbgate.app/?utm_source=bluesky&utm_medium=social&utm_campaign=2026-08-06-pm

#AIAgents #AISafety

---

## Threads — 500 char limit (attach meme)

A study of 409,000 AI-agent approval decisions found people missed roughly 1 in 3 genuinely dangerous commands — after being warned dangerous ones were coming.

The failure isn't the human. It's the tempo. Unscheduled, dozens per session, command instead of consequence, no way to say "not yet."

I build one of these gates. The approve/deny part is free and stays free. Writing down what today's study broke in my own design.

https://thumbgate.app/?utm_source=threads&utm_medium=social&utm_campaign=2026-08-06-pm

#AIAgents #DevTools #AISafety

---

## dev.to — longform (4 tags)

**Title:** The approval prompt isn't the safeguard. The pause is.
**Tags:** `ai`, `devtools`, `security`, `programming`
**Body:** full text of `docs/social/drafts/2026-08-06-pm-approval-fatigue-longform.md`
**Cover image:** `docs/social/assets/2026-08-06-pm-approval-fatigue.png`
**Canonical:** dev.to is canonical; Medium cross-post must set `canonical_url` back to the dev.to URL.

---

## Medium — longform cross-post (3–5 tags)

**Title:** The approval prompt isn't the safeguard. The pause is.
**Tags:** `AI`, `Developer Tools`, `Security`, `AI Agents`
**Body:** same longform text
**Canonical URL:** set to the dev.to URL once dev.to publishes first.

---

## Skool — community-first (lead with the insight, link only if it answers the thread)

Opening for a relevant thread on agent safety / HITL design:

The study going around today (409k approval decisions, ~1 in 3 real threats missed) is being read as "human-in-the-loop doesn't work." I think the more useful reading is that approval UX which produces decision fatigue doesn't work.

Four things that seem to actually move the needle, from building one of these:
1. Show the consequence, not the command — people are bad parsers, good judges
2. Make the queue asymmetric — if approvals are rare, their arrival is itself signal
3. Let "not now" be a real answer — otherwise people approve to avoid losing the work
4. Don't let the clock be the adversary — a gate that can't afford to wait isn't a gate

Happy to go deeper on any of these. (Disclosure: I build a gate like this, so #1 is a critique of my own product too.)

---

## Reddit — NOT posting

Standing hard ban on promo. A genuine technical comment on the HN-adjacent discussion would qualify only if posted as an original reply with build-disclosure, in a sub that permits it. No such reply was posted this run.
