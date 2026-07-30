#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];

function isText(value, maxLength = 20_000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function containsSecret(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isHumanVerified(item) {
  return item.humanVerified === true ||
    item.labelSource === 'human' ||
    item.sourceType === 'human_feedback';
}

function readSourceRecords(memoriesPath) {
  if (!fs.existsSync(memoriesPath)) return [];
  const raw = fs.readFileSync(memoriesPath, 'utf8');
  if (path.extname(memoriesPath).toLowerCase() === '.jsonl') {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`Invalid ThumbGate memory JSONL at line ${index + 1}`);
        }
      });
  }
  const parsed = JSON.parse(raw);
  const records = Array.isArray(parsed) ? parsed : parsed?.memories;
  if (!Array.isArray(records)) {
    throw new Error('ThumbGate memories source must be JSONL, an array, or { memories: [] }');
  }
  return records;
}

function exportDpoPairs(options = {}) {
  const root = options.cwd || process.cwd();
  const memoriesPath = options.memoriesPath ||
    path.join(process.env.HOME || '', '.thumbgate', 'memory-log.jsonl');
  const outputPath = options.outputPath || path.join(root, '.thumbgate', 'dpo_pairs.jsonl');

  const pairs = [];
  const rejected = {
    notHumanVerified: 0,
    incomplete: 0,
    identicalAnswers: 0,
    secretDetected: 0,
    duplicate: 0
  };
  const data = readSourceRecords(memoriesPath);
  if (data.length > 0) {
    const seen = new Set();
    for (const item of data) {
      if (!isHumanVerified(item)) {
        rejected.notHumanVerified += 1;
        continue;
      }
      const prompt = item.prompt;
      const chosen = item.chosen || item.solution;
      const rejectedAnswer = item.rejected;
      if (!isText(prompt) || !isText(chosen) || !isText(rejectedAnswer) ||
          !isText(item.annotationId, 160) ||
          !isText(item.timestamp, 80) ||
          Number.isNaN(Date.parse(item.timestamp))) {
        rejected.incomplete += 1;
        continue;
      }
      if (chosen.trim() === rejectedAnswer.trim()) {
        rejected.identicalAnswers += 1;
        continue;
      }
      if ([prompt, chosen, rejectedAnswer].some(containsSecret)) {
        rejected.secretDetected += 1;
        continue;
      }
      const pairDigest = sha256(JSON.stringify([prompt, chosen, rejectedAnswer]));
      if (seen.has(pairDigest)) {
        rejected.duplicate += 1;
        continue;
      }
      seen.add(pairDigest);
      pairs.push({
        prompt,
        chosen,
        rejected: rejectedAnswer,
        source: item.source || 'thumbgate-feedback',
        annotationId: item.annotationId,
        timestamp: item.timestamp,
        pairDigest
      });
    }
  }

  pairs.sort((left, right) => {
    const timeOrder = left.timestamp.localeCompare(right.timestamp);
    return timeOrder || left.pairDigest.localeCompare(right.pairDigest);
  });

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  }
  fs.chmodSync(outputDir, 0o700);

  const lines = pairs.map((pair) => JSON.stringify(pair)).join('\n');
  const serialized = lines ? `${lines}\n` : '';
  const temporaryPath = path.join(
    outputDir,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, outputPath);
  fs.chmodSync(outputPath, 0o600);

  return {
    status: pairs.length > 0 ? 'ready' : 'insufficient_data',
    totalExported: pairs.length,
    rejected,
    outputPath,
    sourcePath: memoriesPath
  };
}

if (require.main === module) {
  try {
    const res = exportDpoPairs();
    console.log(
      `${res.status}: exported ${res.totalExported} human-verified DPO training pair(s) ` +
      `to ${res.outputPath}`
    );
    if (res.status !== 'ready') {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`DPO export failed closed: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { exportDpoPairs, isHumanVerified, readSourceRecords };
