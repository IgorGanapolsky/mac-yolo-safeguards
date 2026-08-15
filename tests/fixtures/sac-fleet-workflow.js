const hits = await sac.fanout(['Search-as-Code', 'WANDR benchmark'], { limit: 4, provider: 'code' });
const unique = sac.dedupe(hits);
const ranked = sac.rerank('Search as Code sandbox', unique, { strategy: 'rrf', limit: 5 });
persist('fixture-run', { count: ranked.length });
return { count: ranked.length, table: sac.synthesize_table(ranked, ['title', 'source']) };
