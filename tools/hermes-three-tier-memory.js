#!/usr/bin/env node
'use strict';

/**
 * hermes-three-tier-memory.js
 *
 * Implements MiMinions-inspired Three-Tier Memory Architecture & Distiller:
 *  - Tier 1: Ephemeral Chronological Session Log (HISTORY.md / JSONL)
 *  - Tier 2: Curated Workspace Memory & Invariants (MEMORY.md)
 *  - Tier 3: Long-term Semantic Vector / Key-Value Store (SQLite / JSON)
 *
 * Includes an automated Distiller that promotes high-signal lessons and facts
 * from Tier 1 into Tier 2 and Tier 3.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'coordination', 'memory');
const HISTORY_FILE = path.join(MEMORY_DIR, 'HISTORY.md');
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md');
const VECTOR_STORE_FILE = path.join(MEMORY_DIR, 'knowledge-index.json');

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

class ThreeTierMemoryEngine {
  constructor(dir = MEMORY_DIR) {
    this.dir = dir;
    this.historyFile = path.join(dir, 'HISTORY.md');
    this.memoryFile = path.join(dir, 'MEMORY.md');
    this.vectorStoreFile = path.join(dir, 'knowledge-index.json');
    ensureMemoryDir();
  }

  /**
   * Tier 1: Appends a session event to HISTORY.md.
   */
  logSessionEvent({ agentId, action, summary, tags = [] }) {
    const timestamp = new Date().toISOString();
    const entry = `\n### [${timestamp}] ${agentId}: ${action}\n- **Summary**: ${summary}\n- **Tags**: ${tags.join(', ') || 'none'}\n`;
    fs.appendFileSync(this.historyFile, entry, 'utf8');
    return { logged: true, timestamp, action };
  }

  /**
   * Reads Tier 1 history entries.
   */
  getHistory(limit = 20) {
    if (!fs.existsSync(this.historyFile)) return [];
    const content = fs.readFileSync(this.historyFile, 'utf8');
    const sections = content.split('\n### ').filter(Boolean);
    return sections.slice(-limit).map(s => `### ${s}`.trim());
  }

  /**
   * Tier 2: Updates or reads MEMORY.md (stable workspace facts).
   */
  getWorkspaceMemory() {
    if (!fs.existsSync(this.memoryFile)) return '';
    return fs.readFileSync(this.memoryFile, 'utf8');
  }

  setWorkspaceMemory(content) {
    fs.writeFileSync(this.memoryFile, content, 'utf8');
  }

  /**
   * Promotes a verified fact/rule into Tier 2 MEMORY.md.
   */
  promoteToMemory(fact, category = 'General') {
    let current = this.getWorkspaceMemory();
    if (!current) {
      current = `# Workspace Memory & Invariants\n\n## Curated Facts\n`;
    }
    const line = `- **[${category}]** ${fact} *(Added: ${new Date().toISOString().slice(0, 10)})*\n`;
    if (!current.includes(fact)) {
      current += line;
      this.setWorkspaceMemory(current);
      return { promoted: true, fact };
    }
    return { promoted: false, reason: 'Duplicate fact already in MEMORY.md' };
  }

  /**
   * Tier 3: Indexes a document or lesson into the long-term knowledge store.
   */
  storeKnowledge(docId, text, metadata = {}) {
    let index = {};
    if (fs.existsSync(this.vectorStoreFile)) {
      try { index = JSON.parse(fs.readFileSync(this.vectorStoreFile, 'utf8')); } catch { index = {}; }
    }

    const sha256 = crypto.createHash('sha256').update(text).digest('hex');
    index[docId] = {
      id: docId,
      text,
      sha256,
      metadata,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(this.vectorStoreFile, JSON.stringify(index, null, 2), 'utf8');
    return index[docId];
  }

  /**
   * Recalls knowledge from Tier 3 by keyword/metadata matching.
   */
  recallKnowledge(query, filterTag = null) {
    if (!fs.existsSync(this.vectorStoreFile)) return [];
    let index = {};
    try { index = JSON.parse(fs.readFileSync(this.vectorStoreFile, 'utf8')); } catch { return []; }

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];

    for (const item of Object.values(index)) {
      if (filterTag && item.metadata?.tag !== filterTag) continue;
      const textLower = item.text.toLowerCase();
      let matchCount = 0;
      for (const t of terms) {
        if (textLower.includes(t)) matchCount++;
      }
      if (matchCount > 0) {
        results.push({ ...item, score: matchCount / terms.length });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Automated Distiller: Scans Tier 1 history for lessons tagged with 'promote' or 'rule'
   * and promotes them to Tier 2 (MEMORY.md) and Tier 3 (knowledge index).
   */
  distill() {
    const history = this.getHistory(50);
    const promoted = [];

    for (const entry of history) {
      const match = entry.match(/- \*\*Summary\*\*:\s*(.+)/);
      const tagMatch = entry.match(/- \*\*Tags\*\*:\s*(.+)/);
      if (match && tagMatch) {
        const summary = match[1].trim();
        const tags = tagMatch[1].split(',').map(t => t.trim().toLowerCase());

        if (tags.includes('promote') || tags.includes('rule') || tags.includes('invariant')) {
          const res = this.promoteToMemory(summary, tags[0] || 'Invariant');
          if (res.promoted) {
            const docId = `distilled-${crypto.randomBytes(4).toString('hex')}`;
            this.storeKnowledge(docId, summary, { source: 'distiller', tags });
            promoted.push({ docId, summary });
          }
        }
      }
    }

    return { promotedCount: promoted.length, promoted };
  }
}

module.exports = {
  ThreeTierMemoryEngine,
  MEMORY_DIR,
};

if (require.main === module) {
  const mem = new ThreeTierMemoryEngine();
  mem.logSessionEvent({
    agentId: 'miminion-worker-1',
    action: 'deploy_fix',
    summary: 'Cloudflare Workers require exponential backoff on 401/403 errors',
    tags: ['invariant', 'promote'],
  });
  const dist = mem.distill();
  console.log('Distillation result:', dist);
  console.log('Knowledge recall:', mem.recallKnowledge('exponential backoff'));
}
