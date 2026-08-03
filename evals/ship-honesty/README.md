# Ship honesty fixtures

Sample inputs for `tools/ship-claim-batch.js` and Grok workflow `ship-claim-audit`.

```bash
node tools/ship-claim-batch.js --claims-file evals/ship-honesty/sample-claims.json
# Grok: /ship-claim-audit  args.claims_file=evals/ship-honesty/sample-claims.json
```

Expected on sample: BLOCK overclaim-all-live, ALLOW device-with-proof, BLOCK bare-shipped.
