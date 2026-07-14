# Outreach hook — "Scary security email" triage

**Status:** DRAFT template for the existing pipeline (Apollo → Gmail send). Igor reviews before any send.
**ICP:** non-technical / vibe-coding founders who shipped with Cursor, Claude Code, Lovable, Bolt, v0, Replit — especially any who mention Snowflake, Supabase, AWS, or a recent "security alert" in public (GitHub issues, X, Reddit, Skool, indie-hacker communities).
**Why this hook:** it meets the buyer at a moment of fear, with a concrete 48h deliverable, instead of pitching a generic audit. Snowflake's Trust Center CIS 3.1 email fires on virtually every new account (Snowflake's own bootstrap creates the ALLOW_ALL_IPS policy it later flags), so the pool of people who received one is large and refreshed daily.

---

## Cold email — variant A (they mentioned a security alert publicly)

**Subject:** that "critical security violation" email — probably a default, but prove it

Hi {{first_name}},

Saw your post about the {{provider}} security alert. Quick context that might save you a panic: I got the same "1 CRITICAL security violation" email from Snowflake this week. When I audited it, the "violation" turned out to be a policy **Snowflake's own signup flow created** — then its own scanner flagged it a day later.

But "it's probably a default" isn't an answer when it's your customers' data. So I ran the actual checks: full-lifetime login history, admin grants, exfiltration channels (external stages / integrations / shares). Evidence, not vibes. Verdict in under an hour: not breached.

That's the exact thing I sell to founders who built with AI tools: a **$500 Triage Scan** — within 48h you get a written, evidence-backed answer: breached or not, plus the critical fixes ranked (and which "fixes" would actually break your prod — IP pinning behind CGNAT is a classic outage generator).

Want me to take a look? 15-min free check: {{cal_link}}

— Igor
Builder of mac-yolo-safeguards (MIT, open source) — the runaway-AI-agent guardrails kit.

---

## Cold email — variant B (general ICP, no known alert)

**Subject:** the security email your cloud provider will send you this month

Hi {{first_name}},

If you shipped {{product}} with AI coding tools, sometime soon Snowflake / Supabase / AWS / GitHub is going to email you something like "CRITICAL security violation found." I got one this week. Here's the punchline: the "violation" was a default **the provider itself created at account signup** — and most founders can't tell that from a real breach, because the email looks identical either way.

The difference is five queries: login history (full lifetime, not the 7-day view), who holds admin, and whether any exfiltration channel exists. I run exactly that as a fixed-fee **$500 Triage Scan** — 48h, written verdict, evidence attached: breached or not, and what actually needs fixing before real users show up.

Free 15-min safety check if you want a gut-read first: {{cal_link}}

— Igor

---

## DM / short-form variant (Skool, X, LinkedIn DM — ≤ 500 chars)

Got one of those "CRITICAL security violation" emails from Snowflake/Supabase/AWS? I got Snowflake's this week — audited it, and the "violation" was a policy Snowflake's own signup bot created. Most of these emails are noise; some aren't. I do a $500 48h evidence-backed triage that tells you which one yours is (breached or not, with the query results to prove it). Happy to do a free 15-min gut-check first: {{cal_link}}

---

## Sourcing notes (feeds source-agent-reliability-buyers)

- GitHub: search issues/discussions for "Trust Center" + "security violation", "SECURITY_ESSENTIALS", "network policy" panic threads.
- HN Algolia API: "Snowflake security email", "Supabase security advisory", "was I breached".
- Skool communities (warm channel, ≤1-2 posts/community/day per operating model): post the LinkedIn story as value-first content, not a pitch; the offer lives in replies.
- Every recipient logged in pipeline TSV via tools/pipeline-update.js — stage, date, variant used.
