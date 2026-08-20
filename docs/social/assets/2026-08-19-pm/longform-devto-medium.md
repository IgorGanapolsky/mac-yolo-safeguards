---
title: "Your approve/deny gate has a 1-in-3 problem, and it isn't a bug"
tags: ai, agentops, security, opensource
canonical: dev.to (syndicate to Medium via Import a Story, canonical back to dev.to)
---

# Your approve/deny gate has a 1-in-3 problem, and it isn't a bug

A study making the rounds on Hacker News today (340 points and climbing, [HN thread](https://news.ycombinator.com/item?id=49195468)) ran 40,000 approval decisions through a game where players had to review AI agent commands before letting them execute. The headline number: humans missed roughly 1 in 3 commands that were actually dangerous.

If you run coding agents with any kind of human-in-the-loop gate — Claude Code's permission prompts, Cursor's YOLO-mode confirmations, a Slack bot that pings you before an agent touches prod — that number should land uncomfortably close to home. Not because it's shocking. Because it's exactly what you'd expect if you've ever actually been the human in that loop at the end of a long day.

## Why the miss rate isn't the surprising part

The instinct when you see "humans missed 1 in 3" is to look for the failure: bad UI, unclear prompts, insufficiently trained reviewers. Some of that is real — the original discussion thread on HN spent a lot of its 245 comments arguing about which prompts in the underlying game were genuinely ambiguous versus clearly bad.

But the more useful frame is that approval fatigue is structural, not a defect you patch. A human reviewing a shell command has to do, in the space of a glance:

1. Parse what the command literally does (not always obvious — `rm -rf $VAR/` is fine until `$VAR` is empty)
2. Infer what it does *in this specific runtime context* (is `/prod-data` mounted here? is this the right box?)
3. Weigh that against everything else competing for attention right now (a phone notification at 6am is not a code review)

Any one of those three steps degrades under time pressure, fatigue, or a small screen. Stack all three and a 1-in-3 miss rate on genuinely risky commands starts to look almost conservative.

## What this means for "human in the loop" as a security boundary

The uncomfortable conclusion is that a bare approve/deny prompt is not, by itself, a security boundary. It's a speed bump with a human standing next to it who is sometimes asleep on their feet. That doesn't mean the gate is worthless — a speed bump that catches 2 in 3 dangerous commands is still catching 2 in 3 dangerous commands nobody else would have stopped. It means the gate can't be the *only* thing standing between an agent and `rm -rf /prod-data`.

Some concrete implications, in rough order of effort:

- **Reduce what reaches the human at all.** Sandbox by default; only surface approval requests for actions that genuinely need write access outside the sandbox. Every command a human doesn't have to review is one they can't rubber-stamp.
- **Make the risky part impossible to skim past.** Highlighting the actual mutated path, the actual deleted resource, the actual dollar amount — rather than showing the raw command string — moves work from "parse the command" (step 1 above) toward "recognize the consequence," which degrades less under fatigue.
- **Rate-limit approvals, not just commands.** If a human is approving their eleventh command in three minutes, that's a signal the review quality has already dropped, independent of what command eleven actually says.
- **Assume the gate will be wrong sometimes and build for recoverability** — snapshotting, soft-deletes, reversible-by-default operations — rather than only for prevention.

## Where I'm honestly at with this

I've been building [Leash](https://thumbgate.app/), a free approve/deny gate for AI coding agents, on the assumption in this post: that the human step is real but imperfect, and the product's job is to reduce how much weight that single glance has to carry — not to pretend the glance is infallible.

I don't have data proving Leash closes the 1-in-3 gap from today's study. Nobody building in this space that I'm aware of has published that number for their own tool, including me. What I can say honestly, without rounding up: it's free forever, on both web (thumbgate.app) and mobile, built by one person shipping in public, and today's study is exactly the kind of evidence I want to keep testing the design against going forward.

If you review AI agent commands before approving them — laptop, phone, CI dashboard, wherever — I'd genuinely like to know what actually slows you down enough to catch the bad one. That's more useful to me right now than any pitch.

---

**Also available:**
- Web: [thumbgate.app](https://thumbgate.app/?utm_source=devto&utm_medium=social&utm_campaign=2026-08-19-pm&cta_id=2026-08-19-pm_devto_home) — free approve/deny gating, Continuity available when your machine is offline (live pricing on the site)
- Mobile (paid download): [Android](https://thumbgate.app/go/android) · [iOS](https://thumbgate.app/go/ios) — Hermes Mobile: Leash
