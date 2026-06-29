---
title: deny-network-egress
type: gate
action: warn
tool: any
pattern: "curl\\s|wget\\s|fetch\\(|https?://(?!github\\.com|registry\\.npmjs\\.org|api\\.anthropic\\.com)"
severity: medium
layer: Cloud
---

# Gate: deny-network-egress

## Description

Potential unauthorized network egress detected.

## Match Conditions

- **Pattern**: `curl\s|wget\s|fetch\(|https?://(?!github\.com|registry\.npmjs\.org|api\.anthropic\.com)`
- **Layer**: Cloud
- **Unless**: `egress_approved`

## Enforcement

- **Action**: warn
- **Severity**: medium
