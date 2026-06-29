---
title: Missing credentials skipped the marketplace publish step during the release pipeline, leading to a stale extension listing in the VS Code/Open VSX marketplaces.
date: 2026-06-15
signal: down
category: deployment
tags: 
  - deployment
  - ci-cd
  - marketplace
  - "entity:Funnel"
actionType: store-mistake
sourceFeedbackId: fb_1781537882926_hkxztf
---

# Missing credentials skipped the marketplace publish step during the release pipeline, leading to a stale extension listing in the VS Code/Open VSX marketplaces.

## Context

The release workflow published version 1.27.6 but skipped the actual marketplace upload because OVSX_PAT and VSCE_PAT secrets were not set in the repo.

## Corrective Action

Ensure that the build and deployment check verified VSIX builds are uploaded to Releases, and warning banners flag the missing credentials so we do not assume publication is complete without verifying live marketplace listing status.

## Tags

[[deployment]], [[ci-cd]], [[marketplace]], [[entity:Funnel]]
