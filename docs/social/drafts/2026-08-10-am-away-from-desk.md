# 2026-08-10 AM — ready-to-publish copy

**Campaign:** `away-from-desk-2026-08-10-am`
**Persona:** Mac operator away from desk
**Hero:** thumbgate.app · **Secondary:** /go/android · /go/ios

Every claim below was verified live on 2026-08-10 (see PR #1595 Research Receipt).
Live figures used: Web Control $0/mo · Pro Continuity $10/mo (`/api/billing/plan`) ·
Team $49/mo · Hermes Mobile $4.99 both stores · HN item 47911524 = 860 pts / 1,032 comments.

**Guardrails honored:** no traction/user-count claims · approve-deny gating stated as free on web
and mobile · only Continuity priced · no affiliation with Nous Research / Anthropic / OpenAI /
Cursor / Fly.io · no guaranteed savings · no review solicitation · no free-install language.

---

## 1. LinkedIn — primary (operator story, no meme per engine spec)

The agent that deleted a production database in 9 seconds wasn't rogue. Nobody was watching.

That Hacker News thread is still one of the most-discussed things written about agent safety — 860 points, over a thousand comments. What's striking is that the top comments don't really blame the model. They blame the fact that a tool holding production credentials had no step where a human said yes.

I keep coming back to one detail: nine seconds.

There is no realistic version of "I'll keep an eye on it" that catches a nine-second mistake. Not if you're in a meeting. Not if you're asleep. Not if you walked down the hall for coffee. "Supervise your agent" is advice that quietly assumes you are sitting in front of it, and most of the day you are not.

So the useful question isn't how to watch more carefully. It's where the approval lives when you're not at your desk.

That's what I'm building ThumbGate for. It's a web dashboard for Hermes agents running on your own Mac: real agent state from any browser, and approve or deny each tool call before it runs. The approve/deny gating is free — on web and on mobile — and I intend to keep it that way. A safety gate you have to pay for is a safety gate people switch off.

The only paid piece is Continuity: when the Mac goes offline, eligible work hands off to a fenced VPS runner under a policy you set — one thread, one executor. That's $10/month today, $49 for the team tier. The free dashboard doesn't expire if you never buy it.

Honest status: I'm a solo founder and this is early. I'd rather have ten people tell me exactly where it breaks than a hundred quiet signups.

If you run agents with shell access on a machine you'd hate to lose:
https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-08-10-am

---

## 2. X

An AI agent deleted a production database in 9 seconds.

Everyone wrote the postmortem about credentials. Nobody wrote the one about timing: there was no moment where a human could say no.

You can't "watch carefully" for nine seconds. The approval has to reach you.

Free approve/deny from any browser:
https://thumbgate.app/?utm_source=x&utm_medium=social&utm_campaign=2026-08-10-am

---

## 3. Bluesky (≤300 chars)

An agent wiped a production database in 9 seconds. You can't supervise that — the approval has to reach you instead.

Approve or deny each tool call from any browser, free:
https://thumbgate.app/?utm_source=bluesky&utm_medium=social&utm_campaign=2026-08-10-am

<!-- 259 chars incl. URL — verified under Bluesky's 300-grapheme limit -->


---

## 4. Threads

The scariest part of that "an agent deleted our production database in 9 seconds" thread isn't the delete.

It's that almost every fix suggested afterward quietly assumed somebody was at the keyboard.

Nine seconds. You were not at the keyboard.

So I'm building the boring version: approve or deny each tool call from your phone or any browser, free. The only paid part is what happens when your Mac goes offline.

https://thumbgate.app/?utm_source=threads&utm_medium=social&utm_campaign=2026-08-10-am

---

## 5. dev.to — longform

**Title:** What actually stops the 9-second production delete

**Tags:** ai, devops, security, productivity

---

An AI coding agent deleted a company's production database, and its backups, in about nine seconds. The Hacker News thread ran to over a thousand comments, and the argument in it is more interesting than the incident.

The popular reading is "the agent went rogue." The better-argued reading, and the one that dominates the top comments, is that nothing went rogue at all. A process with production credentials did exactly what it was told, faster than any human could intervene. The failure was architectural: there was no boundary between intent and effect.

Two fixes get proposed whenever this happens. Both are real, and both are incomplete.

### Fix one: access control

Don't give the agent production credentials. Scope the token. Separate the environments. This is correct and you should do it.

But it degrades in practice for a specific reason: the blast radius of a coding agent is the union of everything it can reach, and that set grows every time someone adds a convenience. The staging token that can also see the shared bucket. The deploy script that reads a root-scoped env file. Access control is a policy about a graph that nobody fully holds in their head, and it silently loosens over time.

Access control also can't express the most common real case: the operation is legitimate, the agent is right to consider it, and it still needs a human to look at *this* instance of it before it runs.

### Fix two: block dangerous commands

Pattern-match `rm -rf`, `DROP TABLE`, `terraform destroy`. Refuse them.

This helps and it is worth having. But a denylist only knows the destructive things you already thought of, and the failure mode is always the one you didn't. The home-directory wipes that hit multiple agents in 2025–2026 didn't come from an exotic command — they came from a shell expanding `~` inside an otherwise ordinary cleanup. The command was on nobody's list because, as typed, it wasn't dangerous.

Denylists are a filter over syntax. The risk lives in semantics and context.

### The layer both are missing

Between "the agent decided to do this" and "the machine did it," there should be a place where a human can say no — per call, on the actual arguments, before execution.

That's not a new idea. HumanLayer, for instance, builds exactly this as a framework-agnostic layer, routing approval requests out to Slack and email so a person can approve or reject a specific tool call. The pattern is sound and it's the right shape.

The part I got stuck on is narrower: **the approval has to physically reach you, and the answer has to be quick enough to be worth using.**

Nine seconds is the whole problem. An approval step that lands somewhere you check every twenty minutes does not prevent a nine-second delete; it just means you read about it slightly sooner. And an approval step with too much friction gets switched to auto-approve by the end of the week — which is the same as not having it.

So the design constraints are unusual for a safety feature:

1. It must reach you where you already are, including on a phone, away from the machine.
2. Answering must take one tap, or you will stop answering.
3. It must be free, or people will turn it off to save money — and a safety gate that's off is worse than none, because you think you have it.
4. It must fail closed when you're unreachable, not silently continue.

### What I built

ThumbGate is a web control plane for Hermes agents running on a computer you operate. You pair the Mac once by running an installer that dials out over HTTPS — no inbound ports, no exposing the machine. After that you get real agent state from any browser, and each tool call can be approved or denied before it executes on your machine.

The gating is free on web and mobile, and my intent is to keep it that way, for reason (3) above.

Point four is where it gets genuinely hard, and it's the piece I'm least done with. When your Mac goes offline mid-task, something has to happen, and every option is a tradeoff. You choose the policy: pause, ask, or hand eligible work to a fenced VPS runner. That handoff — Continuity — is the paid part, currently $10/month, $49 for teams. It's built around a lease so one thread only ever has one executor; the thing I'm most concerned about is not a stalled task but two runners writing the same thread, which is strictly worse than stopping.

Honest status: I'm one person, this is early, and it has approximately no users yet. I'm writing this partly to find the failure modes I haven't hit. If you run agents with shell access on a machine that matters, I'd genuinely rather hear what breaks than what's nice.

Web dashboard: https://thumbgate.app/?utm_source=devto&utm_medium=social&utm_campaign=2026-08-10-am

Also available on phone — Hermes Mobile, $4.99: https://thumbgate.app/go/android · https://thumbgate.app/go/ios

---

## Meme — RENDERED

**Asset:** `docs/social/assets/2026-08-10-am/lockscreen-nine-seconds.png` (1080×1350, 4:5)
**Source:** `docs/social/assets/2026-08-10-am/lockscreen-nine-seconds.html` (re-render command below)

A phone lock screen at 2:47 AM. The approval request arrives and is marked *Delivered. Not opened.*
Underneath it, in the same minute: **No response. Proceeding. ✓** · **Dropped `production`. Purged
14 backups. ✓** · **All done — finished in 9s.**

Caption: **Nine seconds. Every notification arrived.**
Sub: *An approval that reaches you after the checkmark isn't an approval.*

Attach to X, Bluesky, Threads, and as the dev.to cover. For LinkedIn attach the image **or** post the
text story — never both the same day (see the 2026-08-05 double-post incident in the log).

### How it was made — and why not an image model

Authored directly as HTML/CSS and rasterized with headless Chromium. Nothing about it is
third-party: no meme template, no trademarked format, no copyrighted film or TV still, and no paid
image credits.

This was the right tool rather than the fallback. The entire joke is exact strings — `DROP DATABASE
production;`, *Delivered. Not opened.*, *finished in 9s* — and diffusion image models reliably
garble small text, which would have destroyed the payload. Hand-authored vector/DOM text renders
exactly and stays editable: change a line, re-render, done.

```bash
/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1080,1350 \
  --screenshot=lockscreen-nine-seconds.png \
  file://$PWD/docs/social/assets/2026-08-10-am/lockscreen-nine-seconds.html
```

**Factual care:** the lock screen reads *Tuesday, June 2* — June 2 2026 is genuinely a Tuesday.
June 3 is a Wednesday, which is what the first draft said. The `9s` and the destroyed-backups
detail both trace to the real incident in the Research Receipt, not invention.
