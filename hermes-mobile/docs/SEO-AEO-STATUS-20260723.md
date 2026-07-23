# SEO / AEO status — Hermes Mobile (2026-07-23)

Evidence-only inventory. **ASO** (store search) and **SEO/AEO** (web + answer engines) are different surfaces.

## What is live today (public)

| Surface | URL | Status |
|---------|-----|--------|
| Landing | https://thumbgate.app/ | 200 — Hermes dashboard + Continuity pitch; store CTAs |
| robots | https://thumbgate.app/robots.txt | 200 — allows `/`, disallows `/dashboard` + `/api/` |
| sitemap | https://thumbgate.app/sitemap.xml | 200 — homepage only |
| llms.txt | https://thumbgate.app/llms.txt | 200 — agent-readable product answers |
| ARD catalog | https://thumbgate.app/.well-known/ai-catalog.json | 200 |
| Play (paid) | `com.iganapolsky.hermesmobile.paid` | public 200 |
| Play (free) | `com.iganapolsky.hermesmobile` | public 200 (verify separately if disputed) |
| App Store | id6786778037 | live listing (name may lag staged 1.4 “Hermes Mobile: AI Agent”) |

## Gaps closed in T-HERMES-MOBILE-AEO-SEO-20260723 (this branch)

| Gap | Fix |
|-----|-----|
| Landing had SoftwareApplication only; monitor expected FAQPage | Visible FAQ section + `@graph` FAQPage + MobileApplication JSON-LD |
| `llms.txt` omitted Hermes Mobile / store URLs | Hermes Mobile section + direct answers + `/go/android` + `/go/ios` |
| Meta keywords ignored phone product | Added Hermes Mobile / AI agent phone keywords |
| AEO technicalChecks expected stale `# ThumbGate for Hermes` header | Synced to live `# Leash by ThumbGate` + Hermes Mobile needles |
| AEO LaunchAgent | Installed via `bash scripts/install-thumbgate-aeo-monitor.sh` |

## Still not claimed (honest)

- **Store organic rank** for “Hermes Mobile” / “Hermes AI” — ASO (metadata, ratings, install velocity), not web AEO. Staged ASC 1.4 name may not be live yet.
- **Google AI Overview / ChatGPT citation share** — monitor is a Parallel Search **citation proxy**, not direct AIO telemetry (see `docs/THUMBGATE-AEO-MONITORING.md`).
- **Production deploy** of this branch until PR merges and control-plane deploy runs.
- **Dedicated hermesmobile.com** domain content — not required for ThumbGate-hosted discovery; optional later.

## Commands

```bash
# Technical health only (no paid search)
node tools/thumbgate-aeo-monitor.js --json

# Weekly citation run (spend ceiling $0.10/month hard)
node tools/thumbgate-aeo-monitor.js --execute --write --json

# Install Monday LaunchAgent
bash scripts/install-thumbgate-aeo-monitor.sh
```

## Related

- ASO push log: [ASO-DISCOVERY-PUSH-20260723.md](./ASO-DISCOVERY-PUSH-20260723.md)
- AEO research: [../docs/RESEARCH-THUMBGATE-AEO-JULY-2026.md](../../docs/RESEARCH-THUMBGATE-AEO-JULY-2026.md)
- Domain SEO research: [../docs/RESEARCH-HERMES-DOMAIN-SEO-JULY-2026.md](../../docs/RESEARCH-HERMES-DOMAIN-SEO-JULY-2026.md)
