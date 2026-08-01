#!/usr/bin/env node
'use strict';

/**
 * Post-hoc groundedness checker for RAG answers.
 *
 * Given an answer and the context chunks that were provided to the LLM, this
 * checks whether every claim-like sentence in the answer is supported by the
 * context. It flags unsupported sentences as potential hallucinations.
 *
 * This is a rule-based dependency-free checker. In production you would
 * augment this with an LLM-judge call for borderline cases, but the rule-based
 * layer catches the most dangerous hallucinations (fabricated numbers, proper
 * nouns not in context) with zero latency and zero cost.
 *
 * Usage:
 *   const { checkGroundedness } = require('./tools/rag-groundedness-checker.js');
 *   const result = checkGroundedness(answer, contextChunks);
 *   // result = { grounded, score, unsupportedSentences, reasons }
 *
 * CLI:
 *   echo '{"answer":"...", "context":["chunk1", "chunk2"]}' | node tools/rag-groundedness-checker.js --stdin
 *   node tools/rag-groundedness-checker.js --answer "..." --context "chunk1" --context "chunk2"
 */

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

function splitSentences(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Split on sentence-ending punctuation followed by whitespace + capital/number.
  const sentences = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  // Also split on newlines that look like bullet points or section breaks.
  const further = [];
  for (const s of sentences) {
    const subParts = s.split(/\n+/).filter((p) => p.trim().length > 0);
    further.push(...subParts);
  }
  return further.map((s) => s.trim()).filter((s) => s.length > 10);
}

// ---------------------------------------------------------------------------
// Claim extraction — identify sentences that make factual assertions
// ---------------------------------------------------------------------------

const NON_CLAIM_PATTERNS = [
  /^(here is|here's|below is|the following)/i,
  /^(based on|according to)/i,
  /^(i hope|let me|please note)/i,
  /^(disclaimer|note:|important:)/i,
  /^\[.*\]/, // citation markers
];

const CLAIM_INDICATORS = [
  /\d/, // contains a number (prices, metrics, versions)
  /\$\d/, // dollar amounts
  /\b(is|are|was|were|will|has|have|costs?|charges?|supports?|requires?)\b/i,
  /\b(must|should|need to|always|never)\b/i,
];

function isClaimSentence(sentence) {
  if (NON_CLAIM_PATTERNS.some((re) => re.test(sentence))) return false;
  return CLAIM_INDICATORS.some((re) => re.test(sentence));
}

// ---------------------------------------------------------------------------
// Core groundedness check
// ---------------------------------------------------------------------------

/**
 * Tokenize into normalized word tokens for overlap comparison.
 */
function normalizeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9._$-]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Compute the fraction of answer-sentence tokens that appear in the context.
 */
function tokenOverlap(sentence, contextText) {
  const sentTokens = new Set(normalizeTokens(sentence));
  const ctxTokens = new Set(normalizeTokens(contextText));
  if (sentTokens.size === 0) return 0;
  let matched = 0;
  for (const t of sentTokens) {
    if (ctxTokens.has(t)) matched += 1;
  }
  return matched / sentTokens.size;
}

/**
 * Extract proper-noun-like tokens (capitalized words in mid-sentence).
 */
function extractProperNouns(text) {
  const words = String(text || '').split(/\s+/);
  const properNouns = new Set();
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i].replace(/[^A-Za-z0-9_-]/g, '');
    if (word.length >= 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      properNouns.add(word.toLowerCase());
    }
  }
  return properNouns;
}

/**
 * Extract numeric claims (prices, percentages, version numbers).
 */
function extractNumbers(text) {
  const numbers = new Set();
  const matches = String(text || '').matchAll(/(\$?[\d,]+(?:\.\d+)?)\s*(%|k|M|B|mo|hr|per|usd)?/gi);
  for (const m of matches) {
    numbers.add(m[0].toLowerCase().replace(/\s+/g, ''));
  }
  return numbers;
}

/**
 * Check whether a specific claim sentence is grounded in the context.
 */
function checkSentence(sentence, contextChunks) {
  const combinedContext = contextChunks.join(' ');
  const overlap = tokenOverlap(sentence, combinedContext);

  // Check proper nouns: if the sentence uses a proper noun not in context, it's suspicious
  const sentenceProperNouns = extractProperNouns(sentence);
  const contextProperNouns = extractProperNouns(combinedContext);
  const unmatchedProperNouns = [...sentenceProperNouns].filter((n) => !contextProperNouns.has(n));

  // Check numbers: if the sentence contains a specific price/number not in context
  const sentenceNumbers = extractNumbers(sentence);
  const contextNumbers = extractNumbers(combinedContext);
  const unmatchedNumbers = [...sentenceNumbers].filter((n) => !contextNumbers.has(n) && !n.includes('$0'));

  const reasons = [];

  if (overlap < 0.3) {
    reasons.push(`low_token_overlap:${overlap.toFixed(2)}`);
  }

  if (unmatchedProperNouns.length > 2) {
    reasons.push(`unmatched_proper_nouns:${unmatchedProperNouns.slice(0, 3).join(',')}`);
  }

  if (unmatchedNumbers.length > 0) {
    reasons.push(`unmatched_numbers:${unmatchedNumbers.slice(0, 3).join(',')}`);
  }

  // A sentence is supported if it has decent token overlap and no red-flag numbers
  const grounded = overlap >= 0.3 && unmatchedNumbers.length === 0;
  return { grounded, overlap, reasons, unmatchedNumbers, unmatchedProperNouns };
}

/**
 * Check the full answer for groundedness.
 *
 * @param {string} answer - The LLM-generated answer
 * @param {string[]} contextChunks - The chunks provided as context to the LLM
 * @returns {{ grounded: boolean, score: number, totalClaims: number, supportedClaims: number, unsupportedSentences: object[], reasons: string[] }}
 */
function checkGroundedness(answer, contextChunks) {
  const sentences = splitSentences(answer);
  const claimSentences = sentences.filter(isClaimSentence);

  const results = claimSentences.map((sentence) => {
    const check = checkSentence(sentence, contextChunks);
    return { sentence: sentence.slice(0, 200), ...check };
  });

  const supported = results.filter((r) => r.grounded);
  const unsupported = results.filter((r) => !r.grounded);
  const score = results.length > 0 ? supported.length / results.length : 1;

  return {
    grounded: unsupported.length === 0,
    score: Number(score.toFixed(2)),
    totalClaims: results.length,
    supportedClaims: supported.length,
    unsupportedSentences: unsupported,
    allCheckedSentences: results,
    reasons: unsupported.flatMap((r) => r.reasons),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { answer: '', context: [], stdin: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--answer') args.answer = argv[++i];
    else if (argv[i] === '--context') args.context.push(argv[++i]);
    else if (argv[i] === '--stdin') args.stdin = true;
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let answer = args.answer;
  let context = args.context;

  if (args.stdin) {
    const input = fs.readFileSync(0, 'utf8').trim();
    const parsed = JSON.parse(input);
    answer = parsed.answer || '';
    context = parsed.context || [];
  }

  if (!answer) {
    console.error('Error: --answer is required (or use --stdin with JSON)');
    process.exit(1);
  }
  if (context.length === 0) {
    console.error('Error: at least one --context chunk is required');
    process.exit(1);
  }

  const result = checkGroundedness(answer, context);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Grounded: ${result.grounded ? 'YES' : 'NO'}`);
    console.log(`Score: ${result.score} (${result.supportedClaims}/${result.totalClaims} claims supported)`);
    if (result.unsupportedSentences.length > 0) {
      console.log('\nUnsupported sentences:');
      for (const s of result.unsupportedSentences) {
        console.log(`  - "${s.sentence}"`);
        console.log(`    Reasons: ${s.reasons.join(', ')}`);
      }
    }
  }
}

const fs = require('fs');
if (require.main === module) {
  main();
}

module.exports = {
  checkGroundedness,
  checkSentence,
  splitSentences,
  isClaimSentence,
  extractProperNouns,
  extractNumbers,
  tokenOverlap,
};
