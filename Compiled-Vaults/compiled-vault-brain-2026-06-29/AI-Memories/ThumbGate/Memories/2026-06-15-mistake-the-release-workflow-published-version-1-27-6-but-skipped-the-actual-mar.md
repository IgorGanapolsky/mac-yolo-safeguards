---
title: "MISTAKE: The release workflow published version 1.27.6 but skipped the actual marketplace upload because OVSX_PAT and VSCE_PAT..."
date: 2026-06-15
category: error
tags: 
  - feedback
  - negative
  - deployment
  - ci-cd
  - marketplace
  - "entity:Funnel"
signal: down
---

# MISTAKE: The release workflow published version 1.27.6 but skipped the actual marketplace upload because OVSX_PAT and VSCE_PAT...

What went wrong: The release workflow published version 1.27.6 but skipped the actual marketplace upload because OVSX_PAT and VSCE_PAT secrets were not set in the repo.
How to avoid: Ensure that the build and deployment check verified VSIX builds are uploaded to Releases, and warning banners flag the missing credentials so we do not assume publication is complete without verifying live marketplace listing status.

## Tags

[[feedback]], [[negative]], [[deployment]], [[ci-cd]], [[marketplace]], [[entity:Funnel]]

## Source

Backlink: [[Feedback/fb_1781537882926_hkxztf]]
