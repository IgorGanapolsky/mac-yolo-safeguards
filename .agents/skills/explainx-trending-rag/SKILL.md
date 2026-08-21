---
name: explainx-trending-rag
description: Autonomous ExplainX.ai Trending Ingestion, Data Science/ML TF-IDF Ranking & Agentic RAG Strategy Optimizer for ThumbGate
trigger: ["explainx", "trending", "rag-optimizer", "strategy-optimizer", "tf-idf-ranking"]
---

# ExplainX Trending Ingestor & Agentic RAG Optimizer

Ingests trending AI skills, MCP servers, and agent workflows from `https://explainx.ai/trending`, applies statistical NLP / ML TF-IDF vectorization and cosine similarity scoring, and synthesizes high-ROI architectural recommendations for ThumbGate.

## Capabilities

1. **Continuous Ingestion**: Ingests real-time popular AI skills, MCP servers, tools, and agent loops.
2. **Data Science / ML Vectorization**: Tokenization, stopword filtering, TF-IDF calculation, and cosine similarity against ThumbGate core capabilities.
3. **Agentic RAG Optimization**: Formulates concrete, prioritized strategic engineering actions based on compounding ROI utility scores.
4. **Audit Receipt Persistence**: Outputs timestamped, structured JSON reports to `~/.hermes/receipts/explainx-trending/latest.json`.

## CLI Usage

```bash
# Run one-shot analysis
node tools/explainx-trending-rag-engine.js

# Run test suite
node tests/test-explainx-trending-rag-engine.js
```
