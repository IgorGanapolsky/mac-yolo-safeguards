---
title: mcp-sql-bulk-update-warn
type: gate
action: block
tool: any
pattern: "(?:WHERE\\s+1\\s*=\\s*1|WHERE\\s+true|WITHOUT\\s+WHERE)"
severity: critical
layer: Execution
---

# Gate: mcp-sql-bulk-update-warn

## Description

SQL MCP bulk update without a safe WHERE clause. This could modify all records in the table.

## Match Conditions

- **Pattern**: `(?:WHERE\s+1\s*=\s*1|WHERE\s+true|WITHOUT\s+WHERE)`
- **Layer**: Execution

## Enforcement

- **Action**: block
- **Severity**: critical
