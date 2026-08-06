# GDG community post draft — ThumbGate expertise hub

**Platform:** gdg.community.dev (Google Developer Groups / Google account auth)  
**Campaign:** expertise-hub-20260806  
**Angle:** Show the engineering data behind a production AI-agent control plane, not a sales pitch.

---

**Title:** We built an open telemetry page for our AI-agent control plane — here’s the data

**Body:**

I run a small Mac-to-cloud remote-control stack for the Hermes agent ecosystem. The product, ThumbGate, is free for local web control, with managed cloud continuity as a paid tier.

A lot of agent-tooling landing pages quote metrics that are hard to verify. We wanted to do the opposite, so we shipped a public `/expertise` page that pairs original case studies with live production telemetry pulled from our own D1 tables:

- Cloud continuity success rate (last 30 days)
- Median / p95 continuity run duration
- Pairing completion counts and transport mix (USB, Tailscale, LAN)
- Control-plane and runner uptime
- Scale: paired machines, active sessions, tasks completed

The numbers refresh every 5 minutes from a public `/api/expertise/stats` endpoint, and we document the methodology directly on the page: D1 source tables, privacy boundary (no customer names or machine identifiers), and exclusion of synthetic canary runs.

Every case study is authored by name, links to the raw stats, and explains what was actually shipped rather than aspirational capability.

If you’re building or operating agent infrastructure, I’d love feedback on the format. The page is here:
https://thumbgate.app/expertise?utm_source=gdg&utm_medium=community&utm_campaign=expertise-hub-20260806

---

**CTA:** Read the live data and case studies at https://thumbgate.app/expertise

**Hashtags/labels:** #AIAgents #Hermes #RemoteControl #Cloudflare #D1 #DeveloperTools

---

**Pre-publish checks required:**
- `node tools/social-publish-gate.js --platform gdg --campaign expertise-hub-20260806 --body-file docs/social/drafts/gdg-expertise-hub-20260806.md --require-buy-links`
- `node tools/verify-public-post.js` after publish
- Append row to `docs/social/hermes-mobile-content-log.tsv` with LIVE URL.

**Auth blocker:** gdg.community.dev requires a logged-in Google/ GDG account. No automated credentials or approved non-daily browser profile are present in this session. Promotion is blocked at the auth boundary until a safe session is available.
