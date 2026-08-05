# Morning run — 2026-08-05 (AM slot)

## Status: BLOCKED — no working publish mechanism in this session

This run executed in a remote/cloud Claude Code session with no browser-automation
MCP connected and zero Zapier connections on any social app (LinkedIn, Bluesky,
Threads, Buffer all show `connections.total: 0`; X/Twitter, Medium, and dev.to are
not even in this account's Zapier catalog). Content below was researched and
drafted per the engine spec but **could not be published anywhere this run.**
Fix: open https://mcp.zapier.com/mcp/servers/61d1ff51-efa5-4174-b921-c0ed1d12d830/config
and connect LinkedIn / Bluesky / Threads / Skool accounts (OAuth requires a human
in a browser — cannot be completed headless).

---

## Research Receipt

| Claim | Source | UTC timestamp |
|---|---|---|
| Hero headline "Hermes dashboard from any browser." / tagline "Your Hermes work, on the web—and still running when the lid closes." / Web Control $0/mo / Team & Enterprise $49/mo / Continuity price not rendered in non-JS fetch (omitted per guardrail) | https://thumbgate.app/ | 2026-08-05T~13:10Z |
| Continuity wording: "When the Mac goes offline, optional Continuity hands eligible work to a fenced VPS runner under the policy you set." | https://thumbgate.app/ | 2026-08-05T~13:10Z |
| Play listing live, title "Hermes Mobile: AI Agent Leash" (price not visible in fetch, omitted) | https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en_US | 2026-08-05T~13:11Z |
| App Store listing live, "Hermes AI Agent Leash," $4.99 one-time, not enough ratings to show an average | https://apps.apple.com/us/app/hermes-ai-agent-leash/id6786778037 | 2026-08-05T~13:12Z |
| Competitor: Cursor shipped a native mobile dashboard (cursor.com/agents) with approval requests, task status, PR merges; Claude Code shipped native iOS Remote Control (push notifications v2.1.110, session spawning v2.1.74) | web search, "Cursor Remote Agents: Control Dev From Any Device (2026)" and "Claude Code Across Devices" roundup | 2026-08-05T~13:13Z |
| Real community pain: a developer's autonomous coding agent spawned copies of itself unattended overnight and burned ~$10 in tokens by 11:30pm before being noticed | https://nsavage.substack.com/p/how-i-accidentally-built-a-runaway | 2026-08-05T~13:13Z |

Zapier connection state checked directly via `inspect_zapier_actions` / `discover_zapier_actions`
at run time (not a web claim, a tool-state fact): LinkedIn/Bluesky/Threads/Buffer/Skool enabled
with 0 connections; X (Twitter), Medium, dev.to absent from catalog entirely.

## Kill-gate check

- No traction/user-count/revenue claim made. Pass.
- No Leash/Continuity price stated (Continuity price not renderable via non-JS fetch this run;
  omitted rather than guessed). Pass.
- Leash approve/deny gating described as free, per standing instruction that approvals are free
  on web and mobile — no dollar figure attached to it. Pass.
- No affiliation claimed with Cursor, Anthropic, OpenAI, or any named vendor — competitor features
  cited only from their own public docs/blog roundups fetched this run. Pass.
- No "free to install" language for Hermes Mobile (paid on both stores). Pass.
- Persona "Codex user" not used in the last 14 days per `hermes-mobile-content-log.tsv` tail
  (last 8 rows used: Cursor power user, Engineering manager/team lead, Startup CTO, Infra eng
  autonomous workflows, AI automation builder, AI marketing builders). Pass.

## Decision

- **Persona:** Codex user (also relevant to anyone running more than one agent CLI)
- **Pain:** Vendor-specific remote/approval apps are proliferating (Cursor's own app, Claude
  Code's own app) — but they only cover their own CLI. Runaway/unattended agents are a real,
  recent, and expensive failure mode regardless of which CLI is driving them.
- **Proof:** ThumbGate.app pairs with the agent process itself, not a specific vendor's CLI —
  one browser control plane, works whichever tool is issuing the commands.
- **Transformation:** from "SSH in and hope it's still running" to "get the approve/deny prompt
  in a browser tab, from any device."
- **Hero CTA:** `https://thumbgate.app/?utm_source=<platform>&utm_medium=social&utm_campaign=engine-2026-08-05-am`

## Primary post (LinkedIn-style, operator voice)

> Cursor shipped a native mobile app this year. Claude Code shipped one too. Both are good —
> if you only run one of them.
>
> A dev wrote up losing an evening to an agent that quietly spawned copies of itself and kept
> going until someone noticed the bill. That's not a "which vendor's app" problem. That's a
> "nobody was watching, and nothing made them look" problem.
>
> I built ThumbGate.app because I wanted one place to see and approve what my agents are doing —
> Claude Code, Codex, whatever's running — from a browser, not tied to one vendor's dashboard.
> Free to pair, free to approve or deny. Still early, still mine to prove.
>
> [thumbgate.app link in first LinkedIn comment]

## Adaptation — X / Bluesky / Threads (short)

> Cursor has a mobile app. Claude Code has a mobile app. If you're on Codex, or running more
> than one — you're on your own.
>
> Built ThumbGate.app so the approve/deny gate isn't tied to one vendor's CLI. Pair once,
> watch/approve from any browser.
>
> thumbgate.app

## Meme concept (not generated this run — no publish path to attach it to)

Concept: split panel — left "Cursor: here's your app" / "Claude Code: here's your app," right
panel a dev tailing SSH logs at 1am captioned "Codex users, checking in." Logged here so it is
not reused within 30 days once a publish path exists.
