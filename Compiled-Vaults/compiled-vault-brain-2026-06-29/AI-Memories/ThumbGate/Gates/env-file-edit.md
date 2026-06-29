---
title: env-file-edit
type: gate
action: warn
tool: "Edit:env_file"
pattern: \.env
severity: medium
layer: Cloud
---

# Gate: env-file-edit

## Description

Editing .env file — verify you are not deleting existing tokens

## Match Conditions

- **Pattern**: `\.env`
- **Layer**: Cloud

## Enforcement

- **Action**: warn
- **Severity**: medium
