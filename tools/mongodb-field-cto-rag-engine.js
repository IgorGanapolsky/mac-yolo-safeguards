'use strict';

class HybridVectorReranker {
  static rerankCandidates(candidates, query, topK = 3) {
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/).filter(Boolean);

    const scored = candidates.map((cand) => {
      let bm25Score = 0;
      const contentLower = (cand.content || '').toLowerCase();
      for (const w of words) {
        if (contentLower.includes(w)) bm25Score += 1.0;
      }
      bm25Score = Math.min(1.0, bm25Score / Math.max(1, words.length));

      const vectorSim = cand.vectorSimilarity || 0.5;
      const finalRerankScore = Number((0.6 * vectorSim + 0.4 * bm25Score).toFixed(4));
      return { ...cand, rerankScore: finalRerankScore };
    });

    scored.sort((a, b) => b.rerankScore - a.rerankScore);
    return scored.slice(0, topK);
  }
}

class AgenticSemanticCache {
  constructor() {
    this.cache = new Map();
  }

  get(query) {
    const key = query.trim().toLowerCase();
    if (this.cache.has(key)) {
      const hit = this.cache.get(key);
      return {
        hit: true,
        cachedAnswer: hit.answer,
        savedCost: hit.cost,
        latencyMs: 2,
      };
    }
    return { hit: false };
  }

  put(query, answer, costSaved = 0.02) {
    const key = query.trim().toLowerCase();
    this.cache.set(key, { answer, cost: costSaved, timestamp: Date.now() });
    return true;
  }
}

class RetrievalQualityEvaluator {
  static evaluatePrecisionRecall(retrievedDocIds, relevantDocIds, k = 5) {
    const topK = retrievedDocIds.slice(0, k);
    const relevantSet = new Set(relevantDocIds);

    let hits = 0;
    for (const id of topK) {
      if (relevantSet.has(id)) hits++;
    }

    const precisionAtK = Number((hits / topK.length).toFixed(2));
    const recallAtK = Number((hits / Math.max(1, relevantSet.size)).toFixed(2));

    return {
      precisionAtK,
      recallAtK,
      k,
      qualityPass: precisionAtK >= 0.6,
    };
  }
}

module.exports = {
  HybridVectorReranker,
  AgenticSemanticCache,
  RetrievalQualityEvaluator,
};
