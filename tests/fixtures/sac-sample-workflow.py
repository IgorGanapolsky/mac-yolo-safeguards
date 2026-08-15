#!/usr/bin/env python3
import json
from sac_sdk import sac

# Sample agent-generated Search-as-Code research workflow in Python
results = sac.fanout([
    'Agentic Search SDK',
    'Search as Code architecture',
    'Perplexity WANDR benchmark'
], {'limit': 4})

deduped = sac.dedupe(results)
ranked = sac.rerank('Search as Code architecture and benchmark', deduped, {'strategy': 'rrf', 'limit': 4})

claims = [
    'Search as Code is an agentic SDK for programmable retrieval',
    'WANDR benchmark evaluates wide and deep research'
]
verifications = sac.verify_claims(claims, ranked)

output = {
    'totalFound': len(results),
    'dedupedCount': len(deduped),
    'topRanked': [{'title': r.get('title'), 'source': r.get('source')} for r in ranked[:2]],
    'verifications': [{'claim': v['claim'], 'status': v['status'], 'confidence': v['confidence']} for v in verifications],
    'markdownTable': sac.synthesize_table(ranked, ['title', 'source'])
}

print(json.dumps(output, indent=2))
