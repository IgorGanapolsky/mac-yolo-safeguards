# AI App Safety Audit — for founders who built with AI

### Your AI built the app. Nobody's watching the bill.

A fixed-fee, 5-day safety audit for founders who shipped with **Cursor, Claude Code, Lovable, Bolt, v0, or Replit** — *before* a runaway loop, a leaked API key, an open database, or your users' private data turns your launch into a disaster.

**You don't need to read the code. I'll tell you exactly what's dangerous and how to fix it.**

---

## What I check — the 4 silent killers

1. **Leaked secrets & open doors** — exposed API keys, hardcoded credentials, public database tables, missing auth, unprotected admin routes.
2. **Cost runaways** — infinite loops, unbounded API/LLM calls, missing rate limits, and the agent-spawn patterns that turn a $20 month into a $4,000 surprise.
3. **Crash-under-load bugs** — the things that work in the demo and die when 50 real people show up.
4. **Private data leaks** — your users' emails, uploads, chat logs, or payment details quietly flowing into the AI model, its logs, or a third-party API — data you can't see, can't take back, and are legally on the hook for. *(If your app handles user data, this is the one that becomes a breach notice or a lawsuit.)*

## What you get

- A written **Safety Report** in plain English — every finding rated **Critical / High / Low**, with what it is, why it can hurt you, and the exact fix (or the prompt to paste into your AI tool to fix it).
- A **30-minute walkthrough call** so you actually understand your risks.
- A **"safe to launch?" verdict** — go / fix-these-first / get-help.

**Turnaround:** 5 business days. **You provide:** repo / project access + a 15-minute kickoff.

## Pricing

| Tier | What | Price |
|---|---|---|
| **Triage Scan** | Critical findings only, 48-hour async report | **$500** |
| **Safety Audit** | The full 5-day audit + report + walkthrough call | **$2,500** |
| **Fix Pack** *(add-on)* | I implement the Critical fixes for you | **+$1,500** |
| **Stay-Safe Retainer** | Monthly re-scan + alerting + support as you keep shipping | **$2,000/mo** |

## Why me

- I watched an AI agent run my own machine to **load average 307** in an infinite loop — a documented runaway ([CASE-STUDY](./CASE-STUDY.md)). That same class of bug, in *your* cloud account, is a four-figure bill while you sleep. I build the guardrails that catch it.
- I shipped **[mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards)** — MIT, zero telemetry, real downloads — the kit that actually stopped it. Read the code; this isn't a slide deck.
- I run the same AI coding tools you built with, in YOLO mode, every day. I know exactly where they cut corners, because I've had to fix mine.

## Start

**Book a free 15-minute Safety Check:** [cal.com/igor-g-kvqxfo/30min](https://cal.com/igor-g-kvqxfo/30min) · or email **iganapolsky@gmail.com**

> *Founding-customer pricing: the first 1–2 audits run at $750 in exchange for a named testimonial + case study, then $2,500.*
