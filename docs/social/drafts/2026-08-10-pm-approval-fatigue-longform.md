# We already learned this with pagers. We're relearning it with agent approvals.

*Written 2026-08-10. Disclosure: I build [ThumbGate](https://thumbgate.app/), an approval gate for coding agents. A chunk of this post is a critique of the category my own product is in.*

---

If you've run an on-call rotation, you know the shape of this failure already.

You start with alerts on everything, because everything might matter. Within a month the pager fires forty times a night, thirty-nine of them are noise, and the on-call engineer has developed a reflex: silence, glance, back to sleep. Then the one real outage arrives wearing the same clothes as the noise, and it gets silenced too.

Nobody concludes from this that on-call engineers are careless. We concluded, correctly and about fifteen years ago, that **an alert channel with a bad signal-to-noise ratio doesn't degrade gracefully — it inverts.** Past a certain volume, adding alerts makes you less likely to catch the thing you're alerting on. That insight produced alert budgets, symptom-based paging, runbook links in the alert body, and the general principle that if a human can't act on it, it shouldn't page.

We are now rebuilding the exact same failure, from scratch, in AI agent approval prompts. And there's data on it.

## The number

A permission-game study published on 2026-08-06 put roughly 40,000 plays and about **409,000 individual approve/deny decisions** in front of people, told them up front that dangerous commands were mixed in, and measured what got through.

**Roughly one in three genuine threats was approved anyway.**

The HN thread on it split predictably. One camp attacked the methodology — some prompts were ambiguous about whether they were actually risky, which is a fair hit. The other camp said something blunter: the approval click was never a security control in the first place, it's a liability transfer, so that when something goes wrong the vendor can point at your tap.

I build one of these gates. I think the second camp is closer to right than I'd like, and I think the pager analogy explains exactly why.

## Why the approval prompt inverts

Run the on-call diagnostic against a typical agent approval flow:

| Alerting lesson | Typical agent approval prompt |
|---|---|
| Page only on actionable conditions | Prompts on every tool call in the risky class, actionable or not |
| Page on symptoms, not raw causes | Shows a raw command string, not what it will do |
| Put the runbook in the alert | Gives no context on blast radius or reversibility |
| Respect an alert budget | Unbounded — a busy session can generate dozens |
| Never make silence the cheap default | Blocks progress until answered, making approve the cheap default |

Five for five. We built the anti-pattern, then measured the anti-pattern, and are now debating whether humans are any good.

The one that does the most damage is the last row. When the pending call is holding up the work — and especially when the session will *die* if you don't answer, because the lease expires or the laptop sleeps — you haven't asked for a decision. You've imposed a deadline. Deadlines produce reflexes, and reflexes produce that 1-in-3.

## What the alerting playbook says to do about it

The useful thing about this analogy is that the remediation is already written. Port it over:

**1. Approval budget.** Treat every prompt as a withdrawal from a fixed daily attention account. If a session generates thirty approvals, that's a bug in your policy, not diligence. Getting the count down is the primary work — everything else is secondary.

**2. Show the symptom, not the cause.** `rm -rf ./build` and `rm -rf ./bulid` differ by one transposition, and one of them resolves somewhere you didn't intend. Showing a shell string asks the operator to be a parser. Showing *what changes* — paths touched, count, whether it escapes the working tree, whether it's reversible — asks them to be a judge. Humans are dramatically better at the second job.

**3. Runbook in the prompt.** The operator should not have to reconstruct why the call was flagged. What rule fired, what the agent was trying to accomplish, what it did in the three steps before this.

**4. Make "not now" free.** Approve/deny is a false binary. The honest answer during a deploy or a meeting is usually *hold it, I'll look in ten minutes.* If holding costs you the work, people will approve instead — not recklessly, but as a rational trade against a system that priced deliberation too high.

**5. Decouple the decision from the clock.** This is the one I underrated longest. If your architecture can't keep work alive while a human thinks, every gate you ship is a timed exam. Making deliberation cheap is not a comfort feature adjacent to the safety feature — it's a precondition for it.

## Scoring my own product, honestly

ThumbGate is a browser control plane for Hermes coding agents: pair a machine once over outbound HTTPS (no inbound ports), then watch and approve or deny risky tool calls from any browser.

The approve/deny gating — Leash — is **free on web and on mobile, and stays free.** Charging for the thing that stops the bad outcome makes the incentives ugly, so I don't.

Against my own five points:

- **Approval budget** — partial. Policy narrows what reaches you, but tuning it is more manual than it should be, and I don't currently show you your own approval volume over time. That's a real gap and probably the highest-value thing on my list.
- **Symptom over cause** — weakest area. You get the call and its surrounding context, not a computed blast radius. Honest answer: not solved.
- **Runbook in the prompt** — partial. You can see what the agent was doing; the "why did this trip" explanation is thinner than it should be.
- **"Not now" is free** — yes. A call can sit pending instead of forcing a binary.
- **Decoupled from the clock** — this is what Continuity exists for. When the Mac goes offline, eligible work can hand to a fenced VPS runner under a policy you set, so the thread survives the gap. It's the paid tier at **$10/month**, re-checked against the live billing endpoint before publishing. The site's own copy says it's still proving out in real use; I'm going to keep saying that too, because it's true and because I'd rather you hear it from me.

No user-count or traction claim appears in this post because there isn't one worth making. This is early software and I'm writing down what I get wrong in public.

## The part I haven't resolved

Points 1 and 3 pull against each other in a way I can't fully reconcile.

Every call you auto-allow to protect the attention budget is a call no human reviewed. If the auto-allow policy is wrong, you've built a quieter, more confident hole than the noisy one you started with — and the operator's trust in the quiet makes it worse, not better. "Fewer, better approvals" is only correct if the policy deciding *fewer* is conservative and legible, and legible policy is a much harder product problem than rendering a modal.

Alerting had the same argument and mostly settled it empirically, per team, over years. I don't think agent tooling gets to skip that.

If you've run an approval gate in anger and landed somewhere different — particularly if you've measured your own approval volume and miss rate — I'd like to hear it. The failure I'm trying hardest to avoid is the one that thread named: shipping a click-through whose real function is to relocate blame onto whoever tapped it.

---

## Also available

- **ThumbGate (web control plane, free to use):** https://thumbgate.app/?utm_source=github&utm_medium=article&utm_campaign=2026-08-10-pm
- **Android:** https://thumbgate.app/go/android
- **iOS:** https://thumbgate.app/go/ios

Hermes Mobile is a paid download ($4.99 on the App Store, verified 2026-08-10). The web control plane and the approval gating are free.

**Sources:** AI agent permission-game statistics thread, [Hacker News item 49195468](https://news.ycombinator.com/item?id=49195468), posted 2026-08-06 (~40,000 plays / ~409,000 decisions / ~1 in 3 threats missed). Continuity pricing and hero copy verified against https://thumbgate.app/ and its live billing endpoint on 2026-08-10. App Store metadata via iTunes lookup for trackId 6786778037, 2026-08-10.

*No affiliation with Nous Research, Anthropic, OpenAI, Cursor, or Fly.io.*
