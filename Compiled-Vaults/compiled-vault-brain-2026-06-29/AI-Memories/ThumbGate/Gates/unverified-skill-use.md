---
title: unverified-skill-use
type: gate
action: warn
tool: "Skill:load"
pattern: .*
severity: high
layer: Supply Chain
---

# Gate: unverified-skill-use

## Description

Skill provenance check failed. Run 'npm run skill:verify' or satisfy 'skill_verified' with a valid signature to proceed.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Supply Chain
- **Unless**: `skill_verified`

## Enforcement

- **Action**: warn
- **Severity**: high
