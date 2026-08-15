// Sample agent-generated Search-as-Code research workflow
const results = await sac.fanout([
  'Agentic Search SDK',
  'Search as Code architecture',
  'Perplexity WANDR benchmark'
], { limit: 4 });

const deduped = sac.dedupe(results);
const ranked = sac.rerank('Search as Code architecture and benchmark', deduped, { strategy: 'rrf', limit: 4 });

const claims = [
  'Search as Code is an agentic SDK for programmable retrieval',
  'WANDR benchmark evaluates wide and deep research'
];
const verifications = sac.verify_claims(claims, ranked);

return {
  totalFound: results.length,
  dedupedCount: deduped.length,
  topRanked: ranked.slice(0, 2).map(r => ({ title: r.title, source: r.source })),
  verifications: verifications.map(v => ({ claim: v.claim, status: v.status, confidence: v.confidence })),
  markdownTable: sac.synthesize_table(ranked, ['title', 'source'])
};
