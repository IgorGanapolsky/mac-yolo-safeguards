---
name: verify-github-marketplace-listing
description: >
  Evidence-only check whether a GitHub Actions Marketplace listing is actually
  LIVE. Use when: is it on Marketplace, advertise the action, listing URL,
  marketplace 404, did we publish the Action, ThumbGate Agent Governance,
  uses: IgorGanapolsky/ThumbGate. Slash: /verify-github-marketplace-listing.
  Never claim LIVE from a release title or repo banner alone.
---

# Verify GitHub Marketplace Action listing

A published **release** is not a Marketplace listing. A repo banner is not a
listing. An empty search is not proof the slug does not exist.

## When to use

User asks "is it on Marketplace", "did we publish the Action", wants a listing
URL, or any agent is about to say LIVE / advertised / 404-missing.

## Required inputs + access

- Slug (default ThumbGate: `thumbgate-agent-governance`) or `action.yml` `name`
- HTTPS to `github.com` (no GitHub token required for public listing pages)

## Sequence

```bash
# Prefer fleet copy when cwd is mac-yolo-safeguards:
node .agents/skills/github-marketplace-action-publish/scripts/verify-listing.js --json
# Grok user copy (any repo):
node ~/.grok/skills/github-marketplace-action-publish/scripts/verify-listing.js --json
# other action:
node .agents/skills/github-marketplace-action-publish/scripts/verify-listing.js \
  --slug other-action-slug --uses Owner/Repo --query "Other Action" --json
# repo wrapper:
bin/verify-github-marketplace --json
```

Exit **0** = listing HTTP 200 and not a GitHub 404 page. Exit **2** = not live.
Exit **1** = probe failed (network/timeout) — say **unknown**, not "not listed".

## How to validate (LIVE claim)

1. Listing URL HTTP **200** and `<title>` contains the Action name
2. Optional: Marketplace search includes `/marketplace/actions/<slug>`
3. Optional: HTML contains `Owner/Repo@v…`

(1) fail → **not listed** (or **unknown** if probe failed).
(1) pass + (2) fail → still LIVE (search lag).

ThumbGate expected: https://github.com/marketplace/actions/thumbgate-agent-governance
`uses: IgorGanapolsky/ThumbGate@v1` or `@v1.35.2`. Defaults live in the script.

## What to return

The script JSON: `live`, `listing.url`, `listing.http`, `listing.title`,
`listing.uses`, `search.hasSlug`. Quote those fields. Do not paraphrase into
"probably live".

## What requires approval

None — this skill is read-only. It does not publish, edit a release, or post.

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| LIVE from `gh release view` or a "Marketplace" title | Run the verify script this turn |
| Missing because `marketplace/actions/thumbgate` 404s | Use slug from `action.yml` `name` |
| Treat exit 1 as "not listed" | Exit 1 = unknown; exit 2 = not live |
| Treat Play/App Store "published" as this surface | This is GitHub Marketplace only |
