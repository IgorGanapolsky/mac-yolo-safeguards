# Routine: Content Factory (`/routine-content-factory`)

## Objective
Automate the high-volume generation and dispatch of marketing assets without quality decay.

## Steps
1. **Trend Ingest:** Run `/market-intel` to find the "Topic of the Day" (e.g., "Local SQLite Context").
2. **Asset Generation:**
    - Generate 30x platform-specific drafts (LinkedIn, X, Reddit, etc.).
    - Render corresponding SVG carousels.
3. **Safety Gate:** Run `verify-human-paste-anti-slop.sh` on all drafts.
4. **BrowserOS Dispatch:** Use `clawbrowser` to open target platforms and populate drafts.
5. **Evidence Capture:** Record the URLs of all published posts in `.thumbgate/marketing-log.json`.

## Schedule
- **Drafting:** 04:00 AM Daily.
- **Dispatch:** 09:00 AM Daily.
- **Review:** 06:00 PM Daily.
