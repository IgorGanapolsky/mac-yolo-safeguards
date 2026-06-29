---
title: mcp-sql-delete-block
type: gate
action: block
tool: any
pattern: .*
severity: critical
layer: Execution
---

# Gate: mcp-sql-delete-block

## Description

SQL MCP delete_record requires explicit task scope. Destructive database operations must be scoped to prevent accidental data loss.

## Match Conditions

- **Pattern**: `.*`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
