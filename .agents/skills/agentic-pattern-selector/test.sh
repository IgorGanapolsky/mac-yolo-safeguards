#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
node --test "$repo/tests/test-agentic-pattern-selector.js"
node "$repo/tools/agentic-pattern-selector.js" \
  --manifest "$repo/.agents/skills/agentic-pattern-selector/assets/read-research.example.json" \
  >/tmp/agentic-pattern-read-receipt.json
node "$repo/tools/agentic-pattern-selector.js" \
  --manifest "$repo/.agents/skills/agentic-pattern-selector/assets/external-write.example.json" \
  >/tmp/agentic-pattern-write-receipt.json
node -e '
const fs=require("fs");
for(const file of process.argv.slice(1)) {
  const receipt=JSON.parse(fs.readFileSync(file,"utf8"));
  if(receipt.status!=="pass" || !/^[a-f0-9]{64}$/.test(receipt.receiptHash)) process.exit(1);
}
' /tmp/agentic-pattern-read-receipt.json /tmp/agentic-pattern-write-receipt.json
printf 'agentic-pattern-selector skill: PASS\n'
