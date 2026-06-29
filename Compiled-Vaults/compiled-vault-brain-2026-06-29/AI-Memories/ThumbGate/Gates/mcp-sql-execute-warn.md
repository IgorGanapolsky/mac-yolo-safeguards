---
title: mcp-sql-execute-warn
type: gate
action: warn
tool: any
pattern: "(?:drop|truncate|alter|grant|revoke)"
severity: high
layer: Execution
---

# Gate: mcp-sql-execute-warn

## Description

SQL MCP execute_entity matches a potentially destructive DDL pattern. Review before proceeding.

## Match Conditions

- **Pattern**: `(?:drop|truncate|alter|grant|revoke)`
- **Layer**: Execution

## Enforcement

- **Action**: warn
- **Severity**: high
