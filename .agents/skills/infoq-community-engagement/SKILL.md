---
name: infoq-community-engagement
description: InfoQ Autonomous Community Engagement & Monetization Engine. Scans InfoQ articles, generates value-first technical comments, and stages organic ThumbGate/Hermes conversion drafts.
---

# InfoQ Autonomous Community Engagement & Monetization Skill

Scans InfoQ editorial and newsletter topics, drafts high-signal, zero-slop technical responses, and stages organic conversion funnels for ThumbGate.app enterprise pilot gates.

## Global Commands

- **`bin/infoq-engage --doctor`**: Probes engagement engine readiness and active tracked articles.
- **`bin/infoq-engage --scan`**: Lists active InfoQ topics and architectural themes.
- **`bin/infoq-engage --draft`**: Generates and stages technical comment drafts into `coordination/ready-to-post/`.

## Key Capabilities

1. **Value-First Technical Perspective**:
   - Comments provide real engineering benchmarks, root-cause breakdowns, and reproducible solutions.
   - Zero AI fluff or conversational filler.

2. **Organic Funnel Attribution**:
   - Injects UTM-tagged references to ThumbGate self-improving agent firewall and GitHub open-source repositories.

3. **Safe Staging Pipeline**:
   - All drafts are staged in `coordination/ready-to-post/` and audited against `social-publish-gate.js` before broadcast.

## Verification

```bash
# Doctor Status Check
bin/infoq-engage --doctor

# Run Automated Test Suite
node tests/test-infoq-community-engagement.js

# Generate Fresh Discussion Drafts
bin/infoq-engage --draft
```
