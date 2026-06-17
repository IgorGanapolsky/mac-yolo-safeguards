# Step 1 — Recall prior lessons

Call **`mcp__thumbgate__recall`** with a query built from:

- `{{parameters.claim}}`
- `{{parameters.task}}` (if non-empty)
- current git branch from pre-flight (if already available)

Report:

1. Top 3 relevant lessons (or explicit **capture-gap** if none)
2. Any lesson that directly contradicts accepting the claim without new proof
3. Suggested verification commands from retrieved lessons (if any)

Do **not** state whether the claim is true yet. Recall only.
