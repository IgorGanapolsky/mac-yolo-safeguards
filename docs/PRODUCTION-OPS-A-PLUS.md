# Production ops A+ contract

Measured path to **A+ / 10/10** across:

1. Latency & cost control (token metering, route ceilings, cache-read discount)
2. Observability (per-turn RAG/LLM traces with retrieval scores)
3. Failure modes (runtime faithfulness gate)
4. Structured outputs (JSON Schema subset validation, fail-closed)
5. Multi-tenancy document ACL (principal + allow/deny at retrieve)

## Commands

```bash
# Hard scorecard — must exit 0 for A+
node tools/production-ops.js scorecard --json

# Token usage normalize
node tools/production-ops.js validate-usage --json '{"promptTokens":1000,"completionTokens":200,"cacheReadTokens":100}'

# Structured output gate
node tools/production-ops.js validate-structured \
  --schema '{"type":"object","required":["ok"],"properties":{"ok":{"type":"boolean"}}}' \
  --data '{"ok":true}'

# Document ACL filter
node tools/production-ops.js filter-acl \
  --acl tests/fixtures/production/document-acl.example.json \
  --principal org:demo \
  --paths tools/production-ops.js,tools/secrets/x,business_os/y

# Faithfulness gate
node tools/production-ops.js faithfulness \
  --query "What is Continuity?" \
  --answer "..." \
  --sources '["..."]'

# Dual-path with ACL + turn trace
node tools/retrieval-dual-path.js --query "agent swarm" --json \
  --principal org:demo \
  --acl tests/fixtures/production/document-acl.example.json \
  --trace --harness-only

# Economic router with token metering
node tools/hermes-economic-router.js --task "..." --json --write \
  --usage-json '{"promptTokens":1200,"completionTokens":400,"cacheReadTokens":300}' \
  --pricing-json '{"inputPer1M":2,"outputPer1M":6,"cacheReadPer1M":0.5}'
```

## Design rules

- **No fabricated scores.** Scorecard pillars are executable checks.
- **Fail closed** on missing principal with `defaultEffect: deny`.
- **Prefer metered cost** in `agent-cost-analyzer` when receipts include usage.
- **Framework-free** — raw Node, same as the rest of the production stack.

## Honest limits

Neural LLM-as-judge, ColBERT GPU rerank, and enterprise IdP SSO for ACL principals
remain optional upgrades. This contract makes each pillar **measurable and green**
without those dependencies.
EOF
