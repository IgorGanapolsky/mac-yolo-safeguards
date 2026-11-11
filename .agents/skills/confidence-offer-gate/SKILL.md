---
name: confidence-offer-gate
description: "Keep the Mac YOLO Safeguards listing when Spotify Confidence or the Confidence Agent onboarding email is the source. One buyer URL is not an experiment. Demo rows and vendor onboarding emails are not sales. Review before you act; do not install the Confidence MCP/Slack bot or call Confidence."
---

# Confidence offer gate

Use when a request points at `https://app.confidence.spotify.com/experiments` or `~/Downloads/confidence.pdf` (`Meet the Confidence Agent, wherever you work`) and the goal is money for Mac YOLO Safeguards.

The signed-in page on 2026-11-03 was workspace `ThumbGate Workspace`, plan `Free`, profile `Igor G.`. Six rows were visible. Five were marked `Demo data`, including `Reduce checkout time (Ship)`. The other row was `ThumbGate Direct Checkout A/B`. The Mac app was not in the list.

The Confidence Agent onboarding email on 2026-11-08 (from `confidence.spotify.com`) pitches the Confidence Agent across Confidence Projects, Slack (`Admin → Integrations → Slack → Add to Slack`), MCP (`claude mcp add --transport http confidence-flags https://mcp.confidence.dev/mcp/flags`), and connected GitHub. Its best practices are:
1. Give it a clear outcome: `"Summarise the checkout test and flag any guardrail regressions."`
2. Add Slack to a shared product or launch channel, not just DMs.
3. Review before you act. Treat it like a sharp teammate, not autopilot.

Confidence's own result labels are `Ship`, `Continue`, `End`, and `Abort`. `Ship` means a success metric improved and the guardrails held. This check uses a paid order from someone other than the founder as that success metric, keeps the project context and checkout summary local, requires human review before acting (`autopilot=false`), and refuses adding the remote Confidence MCP, Slack bot, or GitHub integration.

The live listing stays `https://iganapolsky.gumroad.com/l/nllmvb`. This check does not rewrite it, does not launch an experiment, and does not call Confidence.

```bash
node tests/test-confidence-offer-gate.js
node tools/confidence-offer-gate.js offer
node tools/confidence-offer-gate.js summary
node tools/confidence-offer-gate.js project
```
