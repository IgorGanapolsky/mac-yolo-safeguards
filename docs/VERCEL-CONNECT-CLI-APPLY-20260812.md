# Vercel Connect CLI (100+ services) → fleet apply (2026-08-12)

**Source:** [Vercel changelog](https://vercel.com/changelog/vercel-cli-100-services) · [CLI docs](https://vercel.com/docs/cli/connect)

## How this helps us

Vercel Connect is **not** a new revenue SKU. It is an agent-ops rail:

| Pattern from Vercel | Transfer to our stack |
|---------------------|------------------------|
| `vercel connect create <service> --name …` finishes setup in terminal | Agents stop opening Connect dashboards in Chrome |
| `vercel connect attach … --project … -e production,preview` | Scoped env attach for hermes-control-plane / previews |
| `vercel connect token <uid>` short-lived scoped tokens | Less long-lived `sk_` / PAT sprawl in `.env` |
| Service can be an **MCP discovery URL** (`mcp.linear.app`) | Same shape as our MCP fleet (Linear, Gmail, …) |
| `--non-interactive` / `--yes` / `--data @file` | CI + agent safe (no secret in argv) |

**Beachhead honesty:** Shopify as the changelog example does **not** map to HVAC / After-Hours Leak Score cash path. Do not force-fit commerce connectors.

## High-ROI now (implemented)

Tool: `tools/vercel-connect-cli-harness.js`

```bash
# Detect CLI + whoami + empty/live connector inventory
node tools/vercel-connect-cli-harness.js probe --json

# Ranked plan + exact create/attach/token recipes
node tools/vercel-connect-cli-harness.js plan --json

# One-service recipe
node tools/vercel-connect-cli-harness.js recipe --service mcp.linear.app --name fleet-linear-mcp
```

**Immediate (roi=1):** `github`, `slack`, `mcp.linear.app`, `stripe`  
**Later:** `sentry`, `notion`  
**Backlog:** `shopify`, `pinecone` (local memory-before-gen already covers agent memory)

## Live evidence (this machine, 2026-08-12)

- CLI: `vercel` **54.2.0**, whoami **igorganapolsky**
- Subcommands: create, list, token, attach, detach, remove, open, update
- `vercel connect list --all-projects` → **No connectors found** (inventory empty until create)
- Connect is **beta** — behavior may change

## What we did **not** do

- Did not create live OAuth connectors that open a browser mid-agent session
- Did not claim “100 connectors active” or fake speedup ratios
- Did not replace Keychain / existing Stripe CLI / Linear API rails
- Did not touch ThumbGate paid pilot outreach (ECI wall still applies to product GTM)

## Next operator steps (when a project needs a token)

1. Put credentials in a **file** (not shell history): `credentials.json`
2. `vercel connect create <service> --name <name> --data @credentials.json --yes`
3. `vercel connect attach <service>/<name> --project <vercel-project> -e production -e preview --yes`
4. `vercel connect token <service>/<name> --subject app --format=json`
5. Prefer token-at-runtime over committing secrets

## Related

- Local memory gate: `tools/agent-memory-before-gen.js`
- Hermes control plane: `apps/hermes-control-plane/`
- Prefer headless ops: no desktop Chrome hijack for bulk Connect setup
