---
name: supabase-declarative-db-guardrails
description: Use when editing database schemas, SQL migrations, Cloudflare D1/SQLite/Postgres queries, or auditing pre-production agent confusion. Enforces declarative schema state (pg-delta pattern), anti-paperclipping database guardrails (no RLS disable, no raw binary blobs in OLTP, zero-Docker local DBs, OLTP vs DuckDB/DuckLake OLAP split), and the IBM TechXchange 3-axis pre-production confusion gate.
---

# Supabase Declarative DB & IBM Pre-Production Confusion Guardrails

> **Sources:**
> - **Supabase Co-Founders Paul Copplestone & Ant Wilson (Latent Space):** Declarative schemas (`pg-delta`), anti-paperclipping database skills, zero-Docker local DBs, colocated compute off 2s edge timeouts, OLTP vs. DuckDB/DuckLake OLAP separation, and trigger-based Product-Led Sales (PLS) with control-group uplift.
> - **Kiyu Gabriel, Field CTO Data, IBM Software (`#IBMTechXchange` via `@sarbjeetjohal` / `@rameshchitor`):** *"Confused agents are bad agents... Ambiguous context, conflicting data, unclear tool boundaries: each one shows up as measurable inconsistency before it shows up as a bad decision. Test for it before production, not after."*

## 1. Declarative Schemas (`pg-delta` Pattern) — Never Parse Sequential Migrations
- **Canonical declarative SQL schema:** `schemas/hermes-control-plane.declarative.sql`
- **Canonical ORM schema:** `apps/hermes-control-plane/db/schema.ts`
- **Rule:** Never force an agent to read `apps/hermes-control-plane/drizzle/0000..0009.sql` sequentially to infer current table shapes. Read and update `schemas/hermes-control-plane.declarative.sql` + `apps/hermes-control-plane/db/schema.ts` together, then verify zero drift:
  ```bash
  node tools/supabase-ibm-agent-guardrails.js
  ```

## 2. Anti-Paperclipping Database Guardrails (Hard Blocks)
Coding agents taking shortcuts to "make the test pass" must be blocked on four patterns:
1. **Never Disable Row-Level Security (RLS) or Tenant Filters:**
   - Banned: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, `NO FORCE ROW LEVEL SECURITY`, or blanket `USING (true)` policies on multi-tenant tables (`organizations`, `threads`, `tasks`, `devices`, `response_feedback`).
2. **Never Store Raw Binary / Base64 Images in OLTP Tables:**
   - Banned: `BYTEA`/`BLOB` image columns or `data:image/...;base64,` payloads $>1\text{ KB}$ in D1/SQLite/Postgres. Store media in object storage and keep only content-free metadata, hashes, or URLs in OLTP.
3. **Run Local Databases Without Docker:**
   - Prefer zero-Docker local SQLite/D1 (`wrangler d1` local mode or native SQLite) over spinning up Docker containers (`docker run postgres` / Dockerized local stacks).
4. **Separate OLTP from OLAP (Avoid the HTAP Trap):**
   - Keep D1/SQLite/Postgres strictly for transactional state; route analytical queries and historical rollups to columnar storage via **DuckDB / DuckLake** or JSONL/Parquet snapshots.
5. **Colocate Long-Running Compute:**
   - Never run document chunking, embedding generation (`nomic-embed-text`), or durable agent loops inside 2-second edge functions; run them on the fenced VPS runner or local background daemon.

## 3. IBM Pre-Production Agent Confusion Gate (3 Measurable Axes)
Before shipping any agent workflow to production, run `node tools/supabase-ibm-agent-guardrails.js --json` to verify `confusionScore === 0`:
1. **Context Clarity (`contextClarity`):** Task spec has explicit goal, target files, acceptance criteria, and zero contradictory directives.
2. **Data Consistency (`dataConsistency`):** Zero drift between `db/schema.ts`, `schemas/hermes-control-plane.declarative.sql`, `drizzle/*.sql`, and `THUMBGATE_EXPERT_CARD.txt` snapshots.
3. **Tool Boundary Clarity (`toolBoundaryClarity`):** Every server in `.mcp.json` has explicit `scope`, `locality`, `secret`, and `blastRadius` in `tools/mcp-health-check.js`.
