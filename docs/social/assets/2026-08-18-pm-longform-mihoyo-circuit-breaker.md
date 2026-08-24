# Nothing crashed. That's what should scare you about MiHoYo's $300K night.

Status: written and finished, NOT published. dev.to blocked (no dev.to app in this session's
Zapier catalog, no `DEVTO_API_KEY` env var, no browser in this cloud container). Medium
blocked (no new Medium integration tokens issued since 2023; no dev.to canonical post exists
today to Import-a-Story from, since dev.to itself is blocked). Paste as-is into dev.to once a
key or browser session is available, then Import to Medium from the live dev.to URL so
canonical linking is set automatically.

---

At the 2026 Alibaba Cloud Summit, MiHoYo's head of AI NPC & Gameplay technology, Zheng
Yinhe, told a story that's stuck with me since I read it. An engineer set up dozens of AI
agents to collaborate on an internal project. Overnight, with no one watching, the agents
fell into a loop — critiquing each other's output, regenerating, critiquing again — for
roughly 13 hours straight. By morning, the loop had burned through about 2 million yuan
(~$300,000) in tokens and produced nothing usable. Zheng called it "a necessary learning
expense."

What gets me about this incident isn't the dollar figure. It's that *nothing broke*. No
crash, no exception, no alert. The agents did exactly what agents do: they kept working. The
only thing missing was a human who would have looked at hour two and said "wait, why are we
still going."

## The failure mode isn't malice, it's momentum

Most of the agent-safety conversation in 2026 is about containment: sandboxes, permission
scopes, blast-radius limits. That work matters — it's the right answer to "what if the agent
does something destructive." But MiHoYo's agents weren't destructive. They didn't touch
production, delete a database, or leak a credential. They just... kept going, inside their
own sandbox, spending real money the whole time.

Containment answers "can the agent hurt something outside its box." It doesn't answer "will
anyone notice the agent is still running at 3am, still burning tokens, still producing
nothing." That's a different problem, and it needs a different fix: not a tighter box, but a
cheaper way for a human to check in and say stop.

## Why "just add monitoring" undersells the problem

The obvious response is "set a budget alert." Sure — but an alert that fires after the spend
already happened is a postmortem, not a circuit breaker. The actual fix has to sit *before*
the spend, not after: a gate the agent can't get past without a human answering yes or no,
and a way for that human to answer from wherever they actually are — which, at 2am on a
13-hour run, is asleep, not at a workstation watching a dashboard.

That's the gap I'm building ThumbGate to close. Two pieces, deliberately kept separate so
neither one gets oversold:

- **Leash** — approve/deny gating for sensitive or costly actions, free forever on web and
  mobile. No price gets attached to "should a human see this before it happens." That's a
  line I'm not willing to blur.
- **Continuity** ($10/month, 14 days free) — keeps your agent's session reachable from any
  browser even when your laptop is asleep or closed, so "I wasn't at my desk" isn't the
  reason a loop ran unchecked for 13 hours.

I want to be honest about where this stands: ThumbGate is early. I'm building it in public,
there's no large user base to point to, and the interesting result here isn't "look how many
people use this" — it's "here's the shape of the problem, and here's one honest attempt at
solving it." If you're running multi-agent workflows and this keeps you up at night the way
it does me, I'd rather hear what would actually make you trust a checkpoint than pitch you
on the one I've built.

## The actual lesson

Sandboxing and loop detection are necessary. They're just not sufficient, because they
answer "what can the agent do" and not "is anyone accountable for letting it keep doing it."
MiHoYo's fix, according to the same talk, was cost controls, context pruning, and loop
detection at the platform level — all good, all reactive engineering learned the expensive
way. The cheaper version of that lesson is: put a human decision in the loop *before* hour
one, not after hour thirteen.

---

## Also available

- Web: https://thumbgate.app/?utm_source=devto&utm_medium=social&utm_campaign=2026-08-18-pm&cta_id=2026-08-18-pm_devto_home
- Android: https://thumbgate.app/go/android
- iOS: https://thumbgate.app/go/ios
- GitHub: https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile

Sources: Zheng Yinhe / 2026 Alibaba Cloud Summit, cross-confirmed via 36kr
(eu.36kr.com/en/p/3825876529238657) and an independent X post
(x.com/Pirat_Nation/status/2060723403301269859), fetched 2026-08-18. thumbgate.app hero copy
and `https://thumbgate.app/api/billing/plan` fetched live 2026-08-18.
