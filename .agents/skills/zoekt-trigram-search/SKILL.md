---
name: zoekt-trigram-search
description: Zoekt-Style Fast Trigram Code Search & MCP Bridge Engine. Provides sub-50ms regex & symbol code search across 1,400+ repository files with precision line context snippets.
---

# Zoekt Trigram Code Search Skill

Implements the trigram-indexed code search architecture from Zoekt (Sourcegraph & MCP Market Aug 2026):
1. **Sub-50ms Regex & Symbol Search**: Eliminates brute-force grep overhead by evaluating candidate files through 3-character trigram postings before regex verification.
2. **Precision Line Context Extractor**: Retrieves exact matching lines and locators without loading large files into LLM context windows (>90% token savings).
3. **MCP Tool Integration**: Exposes `search_code`, `search_symbols`, and `index_status`.

## Global System Commands

- **`bin/zoekt-search --doctor`**: Probes trigram index health, indexed file counts, and postings status.
- **`bin/zoekt-search --index`**: Rebuilds the fast trigram index.
- **`bin/zoekt-search "<query>"`**: Performs an instant sub-50ms code search.

## Verification

```bash
# Doctor Status Check
bin/zoekt-search --doctor

# Run Automated Test Suite
node tests/test-zoekt-trigram-search-engine.js

# Search for symbols across repo
bin/zoekt-search "evaluateTemporalPolicy"
```
