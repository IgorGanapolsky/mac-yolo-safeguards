# LinkedIn draft — "Snowflake just emailed you a CRITICAL security violation"

**Status:** PUBLISHED 2026-07-14 (PUBLISH_APPROVED by Igor: "post everything").
**Live post:** https://www.linkedin.com/feed/update/urn:li:share:7482822852161908736
**First comment:** posted + verified (cal.com + GitHub links live, author = Igor). Proof: `proofs/proof-linkedin-snowflake-20260714.png`
**Rules:** link goes in FIRST COMMENT, not body (LinkedIn reach). Post from Igor's Chrome session via /publish-linkedin-via-chrome.

---

## Post body

This morning Snowflake emailed me:

“1 CRITICAL security violation found.”

If you're a founder, that email stops your heart. Were we breached? Is customer data gone?

I audited the account before touching anything. Here's what I found — and it's the same thing you'll find, because it happens to almost every new Snowflake account:

🔍 The “critical violation” was a network policy called ALLOW_ALL_IPS (0.0.0.0/0).

Who created it? Snowflake's own account-provisioning bot — one second after the account was created, with the comment “Policy to allow access from any IP address for API connectors.”

Then Snowflake's Trust Center scanner flagged Snowflake's own default as a critical violation, ~19 hours later.

But “it's a default” is not the same as “you're safe.” So I proved it, with queries, not vibes:

1️⃣ Full-lifetime login history — every login, every IP, every failure (ACCOUNT_USAGE.LOGIN_HISTORY, not the 7-day INFORMATION_SCHEMA view)
2️⃣ Who actually holds ACCOUNTADMIN (SHOW GRANTS OF ROLE ACCOUNTADMIN)
3️⃣ Exfiltration channels — external stages, storage integrations, outbound shares
4️⃣ The findings straight from SNOWFLAKE.TRUST_CENTER.FINDINGS — never trust the email alone
5️⃣ Cross-check every login IP against the machines that should be connecting

Result: zero unknown IPs, zero unknown users, zero exfil paths. Not a breach — a default.

Two lessons for anyone who shipped their product with AI tools:

⚠️ The naive “fix” (pin an IP allowlist) would have caused an outage — my egress IP rotated 3 times in 24 hours behind CGNAT. Security theater breaks production.

⚠️ My first check returned “No data” for network policies — because I ran it with a least-privilege role that couldn't SEE them. “No data” meant “no permission,” not “no policy.” If I'd trusted that, I'd have reported the wrong answer.

Scary security emails are now a weekly reality for founders — Snowflake, Supabase, AWS, GitHub all send them. Most of them are noise. Some of them aren't. The only way to know which is yours: evidence.

If you got one of these and you're not sure — that's literally what I do. 48-hour evidence-backed answer: breached or not, and what (if anything) to fix. Details in the first comment. 👇

#Snowflake #CloudSecurity #Founders #AIEngineering #DataSecurity

---

## First comment (post immediately after)

I run fixed-fee safety audits for founders who built with AI tools (Cursor, Claude Code, Lovable, Bolt, Replit):

🔎 $500 Triage Scan — 48h async report, critical findings only (includes “was I actually breached?” evidence review of exactly this kind of email)
🛡️ $2,500 full Safety Audit — 5 days, plain-English report + walkthrough call

Free 15-min safety check: https://cal.com/igor-g-kvqxfo/30min

The guardrails kit I built (MIT, free): https://github.com/IgorGanapolsky/mac-yolo-safeguards
