#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function exportDpoPairs(options = {}) {
  const root = options.cwd || process.cwd();
  const memoriesPath = path.join(process.env.HOME || '', '.thumbgate', 'memories.json');
  const outputPath = options.outputPath || path.join(root, '.thumbgate', 'dpo_pairs.jsonl');

  const pairs = [];
  if (fs.existsSync(memoriesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(memoriesPath, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.prompt && (item.chosen || item.solution) && item.rejected) {
            pairs.push({
              prompt: item.prompt,
              chosen: item.chosen || item.solution,
              rejected: item.rejected,
              source: item.source || 'thumbgate-feedback',
              timestamp: item.timestamp || new Date().toISOString()
            });
          }
        }
      }
    } catch {}
  }

  // Default baseline pair if memories store is fresh
  if (pairs.length === 0) {
    pairs.push({
      prompt: 'Execute local model completion on 127.0.0.1:8642',
      chosen: 'Use TASK_TIMEOUT_MS (150s) with 3-attempt exponential backoff retry loop',
      rejected: 'Fail immediately after 4s timeout with unhandled SESSION NOT FOUND',
      source: 'hermes-eval-baseline',
      timestamp: new Date().toISOString()
    });
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lines = pairs.map((pair) => JSON.stringify(pair)).join('\n');
  fs.writeFileSync(outputPath, lines, 'utf8');

  return { totalExported: pairs.length, outputPath };
}

if (require.main === module) {
  const res = exportDpoPairs();
  console.log(`Exported ${res.totalExported} DPO training pair(s) to ${res.outputPath}`);
}

module.exports = { exportDpoPairs };
