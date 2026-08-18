---
name: github-marketplace-action-publish
description: >
  Publish or update a GitHub Actions listing on GitHub Marketplace (free only
  for ThumbGate until counsel clearance). Trigger: GitHub Marketplace, publish
  this Action, Draft a release, marketplace listing, advertise the action,
  uses: IgorGanapolsky/ThumbGate, action.yml branding. Slash:
  /github-marketplace-action-publish. Never claim LIVE without
  /verify-github-marketplace-listing. Never add paid Marketplace plans
  without /eci-thumbgate-ip-wall clearance.
---

# Publish a GitHub Action to Marketplace

Marketplace publish is **UI-only**. `gh release create` ships tags; it does
**not** list the Action. BrowserOS neo on the release form is the publish rail.

Chain: `/eci-thumbgate-ip-wall` (ThumbGate) → this skill →
`/verify-github-marketplace-listing`. To cite the listing in promo, then
`/advertise-thumbgate-github-marketplace`.

## When to use

User asks to publish / update / list a GitHub Action on Marketplace, or to
"advertise the Action" via a listing that is not yet proven LIVE.

## Required inputs + access

- Public repo with root `action.yml` (`name`, `description`, `branding.icon/color`)
- `gh` auth for tags/releases
- BrowserOS neo (not Igor's daily Chrome) for the Marketplace checkbox
- Gmail MCP / Hermes Gmail for GitHub sudo OTP (never print the code)
- ThumbGate: `~/.thumbgate/private-legal/eci-employment/STATUS.json`

## ThumbGate defaults (verified 2026-08-17)

| Field | Value |
|-------|--------|
| Repo | `IgorGanapolsky/ThumbGate` |
| Slug | `thumbgate-agent-governance` (from `action.yml` `name`) |
| Listing | https://github.com/marketplace/actions/thumbgate-agent-governance |
| Categories | Primary **Security**, optional **AI Assisted** |
| Install | `uses: IgorGanapolsky/ThumbGate@v1` or `@v1.35.2` |
| Commercial | **Free listing only** until `counsel_clearance=true` |

Repo banner "You can publish this Action" ≠ listed. Wrong-slug 404 is **not**
proof of absence — slugify `action.yml` `name` (spaces → hyphens, lowercased).

## ECI (ThumbGate)

If `counsel_clearance` is not true: free OSS listing of the existing Action is
allowed; paid Marketplace plans, trials, enterprise-claim expansion, and
buyer/pilot outreach from the listing are forbidden. Full wall:
`/eci-thumbgate-ip-wall`. Do not paste employer agreement text here.

## Sequence

1. **Probe first** (prefer fleet copy in this repo):
   ```bash
   node .agents/skills/github-marketplace-action-publish/scripts/verify-listing.js --json
   # any repo:
   node ~/.grok/skills/github-marketplace-action-publish/scripts/verify-listing.js --json
   ```
   If already LIVE at expected slug + version, stop (or ship a new tag only).
2. **Tag + release** (CLI, no Marketplace checkbox):
   ```bash
   gh release create vX.Y.Z --repo OWNER/REPO --target main \
     --title "vX.Y.Z — GitHub Marketplace action" \
     --notes "Free Action. uses: OWNER/REPO@vX.Y.Z"
   ```
   Point floating major tag at the same commit:
   ```bash
   COMMIT=$(gh api repos/OWNER/REPO/git/ref/tags/vX.Y.Z --jq .object.sha)
   gh api -X POST repos/OWNER/REPO/git/refs -f ref=refs/tags/v1 -f sha="$COMMIT" \
     || gh api -X PATCH repos/OWNER/REPO/git/refs/tags/v1 -f sha="$COMMIT" -F force=true
   ```
3. **Publish checkbox** via BrowserOS neo:
   - Open `https://github.com/OWNER/REPO/releases/edit/vX.Y.Z`
   - Disabled checkbox → accept GitHub Marketplace Developer Agreement → Accept Terms
   - Check **Publish this Action to the GitHub Marketplace**
   - Primary + optional second category → Update / Publish release
4. **Sudo wall**: Gmail OTP → `/gmail-auth-fix` if revoked. Do not invent
   "blocked"; tagged `uses:` remains the working rail.
5. **Verify** with `/verify-github-marketplace-listing`. No LIVE claim without exit 0.

## How to validate

Exit 0 from the verify script against the slug derived from `action.yml` `name`.
HTTP 200 + real `<title>` (not GitHub 404 page). Search lag is not a delist.

## What to return

| Field | Source |
|-------|--------|
| LIVE URL | verify script listing URL + HTTP 200 |
| `uses:` | Marketplace dialog or `OWNER/REPO@tag` |
| Version | release tag + floating `v1` SHA |
| ECI | free-only vs paid-paused |

## What requires approval

- Paid Marketplace pricing / trials
- Expanding enterprise claims on the listing
- Buyer/pilot outreach from the listing
- Anything that is not a free listing of the already-public Action

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Treat `gh release create` as Marketplace publish | Probe listing before tagging |
| Guess the slug | Derive from `action.yml` `name`, confirm HTTP 200 |
| Claim search "0 results" without fetching the expected URL | Fetch listing URL + search |
| Paid plans without counsel clearance | Free listing only while `counsel_clearance` is false |
| Igor's daily Chrome | BrowserOS neo |
| LIVE without verify exit 0 | `/verify-github-marketplace-listing` |
