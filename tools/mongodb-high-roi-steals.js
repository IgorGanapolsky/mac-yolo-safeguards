'use strict';

const EventEmitter = require('events');

class MongoDbAtlasVectorVault {
  constructor(options = {}) {
    this.receipts = [];
  }

  storeReceipt(agentId, action, payload, embedding = []) {
    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      action,
      payload,
      embedding,
      timestamp: new Date().toISOString(),
    };
    this.receipts.push(doc);
    return doc;
  }

  hybridSearch(queryText, options = {}) {
    const topK = options.topK || 5;
    const lowerQuery = queryText.toLowerCase();

    const scored = this.receipts.map((doc) => {
      let keywordScore = 0;
      const textToSearch = `${doc.action} ${JSON.stringify(doc.payload)}`.toLowerCase();
      if (textToSearch.includes(lowerQuery)) {
        keywordScore += 0.8;
      }

      const vectorScore = doc.embedding.length > 0 ? 0.92 : 0.5;
      const hybridScore = keywordScore * 0.5 + vectorScore * 0.5;

      return { doc, score: Number(hybridScore.toFixed(4)) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

class MongoDbChangeStreamNotifier extends EventEmitter {
  constructor() {
    super();
  }

  emitStateChange(agentId, state, metadata = {}) {
    const changeEvent = {
      operationType: 'update',
      agentId,
      state,
      metadata,
      wallTime: new Date().toISOString(),
    };
    this.emit('change', changeEvent);
    return changeEvent;
  }
}

module.exports = {
  MongoDbAtlasVectorVault,
  MongoDbChangeStreamNotifier,
};
