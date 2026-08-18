---
name: advertise-thumbgate-github-marketplace
description: >
  Cite the live GitHub Marketplace Action listing when advertising ThumbGate
  (free listing only). Trigger: advertise ThumbGate on Marketplace, listing
  badge, uses: snippet for README, Marketplace install URL, Action discovery.
  Slash: /advertise-thumbgate-github-marketplace. Never claim LIVE without
  /verify-github-marketplace-listing. Never paid plans or buyer outreach
  without /eci-thumbgate-ip-wall clearance.
---

# Advertise ThumbGate via GitHub Marketplace (free listing)

This is the **cite-the-listing** skill, not the publish skill and not paid GTM.
Marketplace is a discovery surface for the existing public Action. It is not
a paid-pilot channel.

Chain: `/verify-github-marketplace-listing` (must exit 0) → this skill.
Publish/update the listing: `/github-marketplace-action-publish`.
ECI wall: `/eci-thumbgate-ip-wall`.

## When to use

User wants to advertise ThumbGate **on / via** GitHub Marketplace, drop a
listing URL into a README or promo draft, or needs the `uses:` snippet.

## Required inputs + access

- Verify script exit 0 this turn (no cached "we published yesterday")
- `counsel_clearance` from `~/.thumbgate/private-legal/eci-employment/STATUS.json`
- Allowed copy: listing URL + `uses:` + categories already on the listing

## Sequence

1. Run `/verify-github-marketplace-listing` (`--json`). Stop if not `live`.
2. Read `counsel_clearance`. If false: **free listing cite only**.
3. Return only evidence-backed fields from the verify JSON.

Allowed cite (after LIVE):

```
Action: https://github.com/marketplace/actions/thumbgate-agent-governance
Install: uses: IgorGanapolsky/ThumbGate@v1
Categories: Security, AI Assisted
```

Do not add $499, Partner Pilot, enterprise hardening, or "book a call" onto
this surface while counsel is uncleared.

## How to validate

Verify script `live=true` and `listing.http=200` in the **same turn**. Stale
vault notes are not evidence.

## What to return

| Field | Source |
|-------|--------|
| Listing URL | `listing.url` |
| Title | `listing.title` |
| `uses:` | `listing.uses` or `@v1` |
| ECI | free-cite-only vs paid-paused |

## What requires approval

- Paid Marketplace plans
- Buyer / pilot / enterprise outreach that uses the listing as a lead magnet
- Expanding listing claims beyond the existing Action description

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Advertise a 404 or guessed slug | Verify this turn |
| Paid plans / pilot CTAs on the listing | Free `uses:` + URL only |
| Invent install badges without LIVE | Quote verify JSON |
| Hijack Igor's Chrome to "screenshot the listing" | HTTPS verify script |
