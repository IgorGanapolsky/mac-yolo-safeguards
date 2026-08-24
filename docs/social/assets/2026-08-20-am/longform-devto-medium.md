---
title: "Slopsquatting is what happens when your AI agent's guess becomes your dependency"
tags: ai, security, agentops, opensource
canonical: dev.to (syndicate to Medium via Import a Story, canonical back to dev.to)
---

# Slopsquatting is what happens when your AI agent's guess becomes your dependency

A story making the rounds today (*The Register*, 20 Aug 2026, PWNED column by Avram Piltch): an engineer at Softjourn asked an AI coding agent to recommend a package for a routine task. The agent came back with a name that looked completely legitimate — a plausible library, formatted the way a familiar one would be.

It wasn't real. According to Softjourn's Sergiy Fitsak, someone had registered that exact package name days earlier and loaded it with malware, betting that a developer under deadline pressure would install first and check later. Security researchers have started calling this pattern **slopsquatting**: AI models sometimes hallucinate plausible-sounding package names, and attackers have learned to register real packages under those exact invented names ahead of time.

Softjourn didn't catch it with a smarter model or a fancier scanner. They caught it because they have a policy — actually followed — of checking a recommended package's download count and source on GitHub before installing anything an AI suggests. The package had a handful of downloads and had been created a few days earlier. That was enough to stop it.

## Why this isn't really a new problem

Typosquatting and dependency-confusion attacks aren't new; slopsquatting is the same attack surface with a new delivery mechanism. What's changed is who's doing the choosing. A human picking a package from npm or PyPI search results has some accumulated instinct for what looks off. An agent generating a plausible name from a language model has no such instinct — it's pattern-matching what a package name *should* look like, and it can be confidently, fluently wrong in exactly the shape an attacker is now watching for.

The same week this story broke, a different but related tool showed up on Hacker News: [Do-over](https://github.com/CaydenChik/doover), a Show HN for undoing AI agent shell commands. Its author built it after an agent accidentally deleted files, and it hooks into Claude Code to snapshot state before commands run — protecting against destructive git commands specifically. It's a different layer of the same problem: Do-over is about *recovering* after an agent does something wrong; slopsquatting is about *preventing* the agent's suggestion from becoming an action in the first place. Both exist because "the agent is usually right" is not the same as "the agent is always right," and neither undo nor prevention alone covers the gap.

## What this means for approval gates

If you run a human-in-the-loop approval step for agent actions — approve/deny prompts, a Slack bot, anything — a package install command is worth treating with the same suspicion as a destructive shell command, not less. It doesn't look risky. That's exactly the property slopsquatting exploits.

Concretely, that argues for:
- Surfacing *what* is being installed, not just the raw command — package name, registry age, download count — the same signal Softjourn's engineer used, made visible instead of requiring someone to go look it up.
- Treating install/dependency-add commands as first-class gated actions, not an afterthought next to `rm -rf`.
- Not assuming a scanner or a smarter model closes this gap. The Softjourn story wasn't caught by tooling; it was caught by a habit.

## Where I'm honestly at with this

I've been building [Leash](https://thumbgate.app/), a free approve/deny gate for AI coding agents, on the idea that the moment before an agent's suggestion becomes an action is the cheapest place to catch the bad one. I don't have data showing it would have caught this specific slopsquatted package — nobody building in this space that I'm aware of has published that number, including me. What I can say without rounding up: it's free to sign in at thumbgate.app, built by one person shipping in public, and stories like this one are exactly what I want to keep testing the design against.

---

**Also available:**
- Web: [thumbgate.app](https://thumbgate.app/?utm_source=devto&utm_medium=social&utm_campaign=2026-08-20-am&cta_id=2026-08-20-am_devto_home) — free sign-in, approve/deny gating in the browser; Hosted Hermes Continuity is a separate $10/month paid tier (14-day free trial, live pricing on the site)
- Mobile (paid download): [Android](https://thumbgate.app/go/android) · [iOS](https://thumbgate.app/go/ios) — Hermes Mobile: Leash, $4.99
