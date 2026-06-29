---
title: schema-migration-approval
type: gate
action: approve
tool: any
pattern: "(?:npx\\s+(?:sequelize|typeorm|prisma|knex|drizzle|flyway|liquibase)|alembic\\s+upgrade|rails\\s+db:migrate|php\\s+artisan\\s+migrate)\\b"
severity: high
layer: Execution
---

# Gate: schema-migration-approval

## Description

Database schema migration detected. Human approval required before this action can proceed.

## Match Conditions

- **Pattern**: `(?:npx\s+(?:sequelize|typeorm|prisma|knex|drizzle|flyway|liquibase)|alembic\s+upgrade|rails\s+db:migrate|php\s+artisan\s+migrate)\b`
- **Layer**: Execution

## Enforcement

- **Action**: approve
- **Severity**: high
