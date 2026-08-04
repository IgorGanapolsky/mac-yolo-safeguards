#!/usr/bin/env node
'use strict';

/**
 * Production ops primitives for A+ grade across:
 *   - latency/cost (token-metered usage + pricing)
 *   - observability (per-turn RAG/LLM traces)
 *   - failure modes (runtime faithfulness gate)
 *   - structured outputs (JSON Schema subset validation)
 *   - multi-tenancy document ACL at retrieve time
 *
 * All pure-enough and fail-closed. No LangChain. No fabricated scores.
 *
 *   node tools/production-ops.js validate-usage --json '{"promptTokens":10,"completionTokens":5}'
 *   node tools/production-ops.js validate-structured --schema '{"type":"object","required":["ok"]}' --data '{"ok":true}'
 *   node tools/production-ops.js filter-acl --acl fixtures/doc-acl.json --paths a.js,b.js --principal org:demo
 *   node tools/production-ops.js faithfulness --answer "..." --sources '["..."]'
 *   node tools/production-ops.js write-trace --out /tmp/turn.jsonl --trace '{...}'
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_TRACE_DIR = path.join(os.homedir(), '.hermes', 'production-traces');
const USAGE_SCHEMA = 'hermes-llm-usage/v1';
const TRACE_SCHEMA = 'hermes-rag-turn-trace/v1';
const ACL_SCHEMA = 'hermes-document-acl/v1';

// ---------------------------------------------------------------------------
// Token usage + cost
// ---------------------------------------------------------------------------

/** @typedef {{ promptTokens: number, completionTokens: number, cacheReadTokens?: number, cacheWriteTokens?: number, totalTokens?: number, model?: string, provider?: string, latencyMs?: number, requestId?: string }} TokenUsage */

/**
 * Normalize and validate token usage. Fail closed on negative / non-finite.
 * @param {Partial<TokenUsage>} raw
 * @returns {{ ok: true, usage: TokenUsage } | { ok: false, errors: string[] }}
 */
function normalizeUsage(raw = {}) {
  const errors = [];
  const num = (v, name) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      errors.push(`${name} must be a non-negative finite number`);
      return 0;
    }
    return Math.floor(n);
  };
  const promptTokens = num(raw.promptTokens ?? raw.prompt_tokens, 'promptTokens');
  const completionTokens = num(raw.completionTokens ?? raw.completion_tokens, 'completionTokens');
  const cacheReadTokens = num(raw.cacheReadTokens ?? raw.cache_read_tokens, 'cacheReadTokens');
  const cacheWriteTokens = num(raw.cacheWriteTokens ?? raw.cache_write_tokens, 'cacheWriteTokens');
  const totalTokens =
    raw.totalTokens != null || raw.total_tokens != null
      ? num(raw.totalTokens ?? raw.total_tokens, 'totalTokens')
      : promptTokens + completionTokens;
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    usage: {
      schema: USAGE_SCHEMA,
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      model: raw.model ? String(raw.model) : undefined,
      provider: raw.provider ? String(raw.provider) : undefined,
      latencyMs: raw.latencyMs != null ? Number(raw.latencyMs) : undefined,
      requestId: raw.requestId ? String(raw.requestId) : undefined,
    },
  };
}

/**
 * USD cost from token usage + optional per-1M pricing.
 * pricing: { inputPer1M, outputPer1M, cacheReadPer1M? }
 */
function estimateCostUsd(usage, pricing = {}) {
  const inputRate = Number(pricing.inputPer1M ?? pricing.promptPer1M ?? 0);
  const outputRate = Number(pricing.outputPer1M ?? pricing.completionPer1M ?? 0);
  const cacheRate = Number(pricing.cacheReadPer1M ?? inputRate * 0.1);
  const prompt = Number(usage.promptTokens || 0);
  const completion = Number(usage.completionTokens || 0);
  const cacheRead = Number(usage.cacheReadTokens || 0);
  // Bill non-cached prompt tokens at full rate; cache reads at discounted rate.
  const billedPrompt = Math.max(0, prompt - cacheRead);
  const usd =
    (billedPrompt / 1e6) * inputRate +
    (completion / 1e6) * outputRate +
    (cacheRead / 1e6) * cacheRate;
  return Number(usd.toFixed(8));
}

/**
 * Attach usage + metered cost onto an economic-router style receipt.
 * Does not mutate the original; returns a new object.
 */
function enrichReceiptWithUsage(receipt, rawUsage, pricing) {
  const norm = normalizeUsage(rawUsage || {});
  if (!norm.ok) {
    return {
      ...receipt,
      usage: { ok: false, errors: norm.errors },
      meteredCostUsd: null,
    };
  }
  const meteredCostUsd = estimateCostUsd(norm.usage, pricing || {});
  return {
    ...receipt,
    usage: { ok: true, ...norm.usage },
    meteredCostUsd,
    // Prefer metered when non-zero tokens; keep estimated ceiling for comparison.
    costSource: norm.usage.totalTokens > 0 ? 'token_meter' : 'route_ceiling',
    effectiveCostUsd:
      norm.usage.totalTokens > 0 ? meteredCostUsd : Number(receipt.estimatedCostUsd || 0),
  };
}

// ---------------------------------------------------------------------------
// Per-turn observability trace
// ---------------------------------------------------------------------------

/**
 * Build a fail-closed turn trace. Missing retrieval scores are allowed but flagged.
 */
function buildTurnTrace(input = {}) {
  const errors = [];
  if (!input.query && !input.task) errors.push('query or task required');
  const retrieval = input.retrieval || {};
  const matches = Array.isArray(retrieval.matches) ? retrieval.matches : [];
  const usageNorm = input.usage ? normalizeUsage(input.usage) : { ok: true, usage: null };
  if (input.usage && !usageNorm.ok) errors.push(...usageNorm.errors.map((e) => `usage.${e}`));

  const topScores = matches.slice(0, 10).map((m, i) => ({
    rank: i + 1,
    path: m.path || m.file_path || null,
    score: m.rrfScore ?? m.rerankScore ?? m.score ?? m.ceScore ?? null,
    sources: m.sources || undefined,
  }));

  const trace = {
    schema: TRACE_SCHEMA,
    id: input.id || `turn-${crypto.randomBytes(8).toString('hex')}`,
    createdAt: new Date().toISOString(),
    query: input.query || input.task || '',
    route: input.route || null,
    tenant: input.tenant || null,
    principal: input.principal || null,
    retrieval: {
      backend: retrieval.backend || retrieval.fusion || 'unknown',
      rewritten: retrieval.rewritten || null,
      multiQuery: retrieval.multiQuery || null,
      rerank: retrieval.rerank || null,
      matchCount: matches.length,
      topScores,
      latencyMs: retrieval.latencyMs ?? null,
    },
    usage: usageNorm.ok ? usageNorm.usage : null,
    meteredCostUsd: input.meteredCostUsd ?? null,
    latencyMs: input.latencyMs ?? retrieval.latencyMs ?? null,
    validation: input.validation || null,
    faithfulness: input.faithfulness || null,
    acl: input.acl || null,
    errors: errors.length ? errors : undefined,
    ok: errors.length === 0,
  };
  return trace;
}

function writeTurnTrace(trace, options = {}) {
  const dir = options.dir || DEFAULT_TRACE_DIR;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = options.file || path.join(dir, 'turns.jsonl');
  const line = `${JSON.stringify(trace)}\n`;
  fs.appendFileSync(file, line, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
  return file;
}

// ---------------------------------------------------------------------------
// Document-level ACL
// ---------------------------------------------------------------------------

/**
 * ACL document shape:
 * {
 *   schema: "hermes-document-acl/v1",
 *   defaultEffect: "deny" | "allow",
 *   principals: { "org:acme": { allow: ["tools/**"], deny: ["secrets/**"] } }
 * }
 *
 * Paths are matched as substrings or simple trailing /** prefix.
 */
function loadAcl(aclPathOrObject) {
  if (!aclPathOrObject) return null;
  if (typeof aclPathOrObject === 'object') return aclPathOrObject;
  const raw = fs.readFileSync(String(aclPathOrObject), 'utf8');
  return JSON.parse(raw);
}

function pathMatchesPattern(filePath, pattern) {
  const norm = String(filePath || '').replace(/\\/g, '/');
  const pat = String(pattern || '').replace(/\\/g, '/');
  if (!pat) return false;
  if (pat.endsWith('/**')) {
    const prefix = pat.slice(0, -3);
    return norm === prefix || norm.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
  }
  if (pat.endsWith('*')) {
    return norm.startsWith(pat.slice(0, -1));
  }
  return norm === pat || norm.includes(pat);
}

/**
 * @returns {{ allowed: boolean, effect: string, matchedRule: string|null }}
 */
function checkDocumentAccess(filePath, principal, acl) {
  if (!acl) return { allowed: true, effect: 'no_acl', matchedRule: null };
  const def = String(acl.defaultEffect || 'deny').toLowerCase();
  const principals = acl.principals || {};
  const rules = principals[principal] || principals['*'] || null;
  if (!rules) {
    return { allowed: def === 'allow', effect: `default_${def}`, matchedRule: null };
  }
  const deny = Array.isArray(rules.deny) ? rules.deny : [];
  for (const d of deny) {
    if (pathMatchesPattern(filePath, d)) {
      return { allowed: false, effect: 'deny', matchedRule: d };
    }
  }
  const allow = Array.isArray(rules.allow) ? rules.allow : [];
  if (allow.length === 0) {
    return { allowed: def === 'allow', effect: `default_${def}`, matchedRule: null };
  }
  for (const a of allow) {
    if (pathMatchesPattern(filePath, a)) {
      return { allowed: true, effect: 'allow', matchedRule: a };
    }
  }
  return { allowed: false, effect: 'implicit_deny', matchedRule: null };
}

/**
 * Filter ranked matches by document ACL. Fail closed: missing principal + deny default → empty.
 */
function filterMatchesByAcl(matches, principal, acl) {
  if (!acl) {
    return { matches, filtered: 0, aclApplied: false };
  }
  if (!principal) {
    return {
      matches: String(acl.defaultEffect || 'deny').toLowerCase() === 'allow' ? matches : [],
      filtered: String(acl.defaultEffect || 'deny').toLowerCase() === 'allow' ? 0 : (matches || []).length,
      aclApplied: true,
      reason: 'missing_principal_fail_closed',
    };
  }
  const kept = [];
  let filtered = 0;
  for (const m of matches || []) {
    const p = m.path || m.file_path || '';
    const decision = checkDocumentAccess(p, principal, acl);
    if (decision.allowed) kept.push({ ...m, acl: decision });
    else filtered += 1;
  }
  return { matches: kept, filtered, aclApplied: true, principal };
}

// ---------------------------------------------------------------------------
// Structured output validation (JSON Schema subset — no AJV dependency)
// ---------------------------------------------------------------------------

/**
 * Supports: type object/array/string/number/boolean/integer/null,
 * required, properties, additionalProperties, enum, minLength, maxLength,
 * minimum, maximum, items, minItems, maxItems.
 */
function validateStructured(data, schema, pathLabel = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') {
    return { ok: false, errors: ['schema must be an object'] };
  }

  const type = schema.type;
  const actual = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;

  if (type) {
    const types = Array.isArray(type) ? type : [type];
    const okType = types.some((t) => {
      if (t === 'integer') return typeof data === 'number' && Number.isInteger(data);
      if (t === 'number') return typeof data === 'number' && Number.isFinite(data);
      if (t === 'null') return data === null;
      return actual === t;
    });
    if (!okType) errors.push(`${pathLabel}: expected type ${types.join('|')}, got ${actual}`);
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${pathLabel}: value not in enum`);
  }

  if (typeof data === 'string') {
    if (schema.minLength != null && data.length < schema.minLength) {
      errors.push(`${pathLabel}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength != null && data.length > schema.maxLength) {
      errors.push(`${pathLabel}: longer than maxLength ${schema.maxLength}`);
    }
  }

  if (typeof data === 'number' && Number.isFinite(data)) {
    if (schema.minimum != null && data < schema.minimum) {
      errors.push(`${pathLabel}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum != null && data > schema.maximum) {
      errors.push(`${pathLabel}: above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      errors.push(`${pathLabel}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.maxItems != null && data.length > schema.maxItems) {
      errors.push(`${pathLabel}: more than maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      data.forEach((item, i) => {
        const nested = validateStructured(item, schema.items, `${pathLabel}[${i}]`);
        errors.push(...nested.errors);
      });
    }
  }

  if (data && typeof data === 'object' && !Array.isArray(data) && data !== null) {
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push(`${pathLabel}: missing required property ${key}`);
      }
    }
    const props = schema.properties || {};
    for (const [key, value] of Object.entries(data)) {
      if (props[key]) {
        const nested = validateStructured(value, props[key], `${pathLabel}.${key}`);
        errors.push(...nested.errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${pathLabel}: additional property not allowed: ${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const nested = validateStructured(value, schema.additionalProperties, `${pathLabel}.${key}`);
        errors.push(...nested.errors);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Runtime faithfulness gate (reuse rag-metrics when available)
// ---------------------------------------------------------------------------

function _tokens(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'is', 'on', 'in', 'to', 'of', 'it', 'as', 'or', 'an', 'be', 'a']);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./+-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[./_+-]+|[./_+-]+$/g, ''))
    .filter((t) => t.length >= 2 && !stop.has(t));
}

/** Lightweight faithfulness when rag-metrics is not on this branch. */
function _localScoreGeneration(query, answer, sources, floors) {
  const src = new Set(_tokens((sources || []).join(' ')));
  const aToks = _tokens(answer);
  const qToks = new Set(_tokens(query));
  const groundedness = aToks.length ? aToks.filter((t) => src.has(t)).length / aToks.length : 0;
  const claims = String(answer || '').split(/(?<=[.!?])\s+/).filter((c) => c.trim().length >= 8);
  let supported = 0;
  const list = claims.length ? claims : [answer];
  for (const claim of list) {
    const toks = _tokens(claim);
    if (!toks.length) {
      supported += 1;
      continue;
    }
    const hit = toks.filter((t) => src.has(t)).length;
    const ratio = hit / toks.length;
    if (ratio >= 0.5 || (hit >= 3 && ratio >= 0.25)) supported += 1;
  }
  const faithfulness = list.length ? supported / list.length : 0;
  let inter = 0;
  for (const t of qToks) if (aToks.includes(t)) inter += 1;
  const precision = aToks.length ? inter / new Set(aToks).size : 0;
  const recall = qToks.size ? inter / qToks.size : 0;
  const answerRelevance = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const pass =
    answerRelevance + 1e-12 >= (floors.minAnswerRelevance ?? 0) &&
    faithfulness + 1e-12 >= (floors.minFaithfulness ?? 0) &&
    groundedness + 1e-12 >= (floors.minGroundedness ?? 0);
  return {
    answerRelevance: Number(answerRelevance.toFixed(4)),
    faithfulness: Number(faithfulness.toFixed(4)),
    groundedness: Number(groundedness.toFixed(4)),
    pass,
  };
}

function runtimeFaithfulnessGate(answer, sources, options = {}) {
  const floors = {
    minAnswerRelevance: options.minAnswerRelevance ?? 0,
    minFaithfulness: options.minFaithfulness ?? 0.5,
    minGroundedness: options.minGroundedness ?? 0.35,
  };
  let score;
  try {
    const { scoreGeneration } = require('./rag-metrics');
    score = scoreGeneration(options.query || '', answer, sources || [], floors);
  } catch {
    score = _localScoreGeneration(options.query || '', answer, sources || [], floors);
  }
  return {
    ok: true,
    pass: score.pass,
    ...score,
    floors,
  };
}

// ---------------------------------------------------------------------------
// Composite production scorecard (offline-capable pillars)
// ---------------------------------------------------------------------------

function scoreProductionPillars(options = {}) {
  const pillars = [];

  // 1) Cost control: usage normalizer + metered cost path exist and work
  const sample = normalizeUsage({ promptTokens: 1000, completionTokens: 500, cacheReadTokens: 200 });
  const cost = sample.ok ? estimateCostUsd(sample.usage, { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3 }) : null;
  pillars.push({
    id: 'latency_cost_control',
    weight: 0.22,
    hard: true,
    ok: sample.ok && cost != null && cost > 0,
    score: sample.ok && cost != null && cost > 0 ? 1 : 0,
    detail: sample.ok
      ? `token meter ok; sample meteredCostUsd=${cost}`
      : `usage invalid: ${(sample.errors || []).join('; ')}`,
  });

  // 2) Observability: turn traces write + include retrieval scores
  const trace = buildTurnTrace({
    query: 'test observability query',
    route: { id: 'local_fast', model: 'qwen' },
    retrieval: {
      backend: 'dual-path',
      matches: [{ path: 'tools/production-ops.js', score: 0.9 }],
      latencyMs: 12,
    },
    usage: { promptTokens: 10, completionTokens: 5 },
    latencyMs: 40,
  });
  let tracePath = null;
  try {
    const dir = options.traceDir || path.join(os.tmpdir(), 'hermes-prod-trace-test');
    tracePath = writeTurnTrace(trace, { dir, file: path.join(dir, 'scorecard-turns.jsonl') });
  } catch (error) {
    /* leave null */
  }
  pillars.push({
    id: 'observability_traces',
    weight: 0.2,
    hard: true,
    ok: Boolean(trace.ok && trace.retrieval.topScores.length && tracePath),
    score: trace.ok && trace.retrieval.topScores.length && tracePath ? 1 : 0.2,
    detail: trace.ok
      ? `trace schema=${TRACE_SCHEMA}; topScores=${trace.retrieval.topScores.length}; path=${tracePath}`
      : `trace errors=${(trace.errors || []).join('; ')}`,
  });

  // 3) Failure modes: faithfulness gate rejects unsupported answer
  const bad = runtimeFaithfulnessGate(
    'We run Kubernetes GPU clusters with guaranteed uptime and E2EE for every tool call.',
    ['Continuity continues eligible work on a fenced VPS when the Mac is offline.'],
    { query: 'What is Continuity?', minFaithfulness: 0.5, minGroundedness: 0.35 },
  );
  const good = runtimeFaithfulnessGate(
    'Continuity continues eligible work on a fenced VPS when the Mac is offline.',
    ['Continuity continues eligible work on a fenced VPS when the Mac is offline.'],
    { query: 'What is Continuity offline VPS?', minFaithfulness: 0.5, minGroundedness: 0.35 },
  );
  const failModeOk = bad.ok && good.ok && bad.pass === false && good.pass === true;
  pillars.push({
    id: 'failure_modes_faithfulness',
    weight: 0.2,
    hard: true,
    ok: failModeOk,
    score: failModeOk ? 1 : 0.3,
    detail: failModeOk
      ? `faithfulness gate rejects unsupported (faith=${bad.faithfulness}) and accepts grounded (faith=${good.faithfulness})`
      : `bad.pass=${bad.pass} good.pass=${good.pass}`,
  });

  // 4) Structured outputs
  const schema = {
    type: 'object',
    required: ['ok', 'route'],
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      route: { type: 'string', minLength: 1 },
      costUsd: { type: 'number', minimum: 0 },
    },
  };
  const vOk = validateStructured({ ok: true, route: 'local_fast', costUsd: 0 }, schema);
  const vBad = validateStructured({ ok: 'yes', extra: true }, schema);
  const structOk = vOk.ok && !vBad.ok;
  pillars.push({
    id: 'structured_outputs',
    weight: 0.18,
    hard: true,
    ok: structOk,
    score: structOk ? 1 : 0.2,
    detail: structOk
      ? 'JSON Schema subset validates good objects and rejects bad ones'
      : `vOk=${vOk.ok} vBad=${vBad.ok} errs=${vBad.errors.slice(0, 3).join('; ')}`,
  });

  // 5) Document ACL
  const acl = {
    schema: ACL_SCHEMA,
    defaultEffect: 'deny',
    principals: {
      'org:demo': { allow: ['tools/**', 'docs/**'], deny: ['tools/secrets/**'] },
    },
  };
  const a1 = checkDocumentAccess('tools/production-ops.js', 'org:demo', acl);
  const a2 = checkDocumentAccess('tools/secrets/keys.env', 'org:demo', acl);
  const a3 = checkDocumentAccess('tools/production-ops.js', 'org:other', acl);
  const filtered = filterMatchesByAcl(
    [{ path: 'tools/production-ops.js' }, { path: 'tools/secrets/keys.env' }, { path: 'business_os/x' }],
    'org:demo',
    acl,
  );
  const aclOk =
    a1.allowed && !a2.allowed && !a3.allowed && filtered.matches.length === 1 && filtered.filtered === 2;
  pillars.push({
    id: 'document_acl',
    weight: 0.2,
    hard: true,
    ok: aclOk,
    score: aclOk ? 1 : 0.2,
    detail: aclOk
      ? 'doc ACL allow/deny + principal isolation + retrieve filter fail-closed'
      : `a1=${a1.allowed} a2=${a2.allowed} a3=${a3.allowed} kept=${filtered.matches.length}`,
  });

  let weighted = 0;
  let weightSum = 0;
  let hardFail = false;
  for (const p of pillars) {
    weighted += p.score * p.weight;
    weightSum += p.weight;
    if (p.hard && !p.ok) hardFail = true;
  }
  const score = weightSum ? weighted / weightSum : 0;
  // A+ only when every hard pillar is green and composite ≥ 0.97
  const grade =
    hardFail ? (score >= 0.85 ? 'B+' : score >= 0.7 ? 'B' : 'C') : score >= 0.97 ? 'A+' : score >= 0.93 ? 'A' : score >= 0.9 ? 'A-' : 'B+';

  return {
    schema: 'hermes-production-a-plus-scorecard/v1',
    checkedAt: new Date().toISOString(),
    grade,
    score: Number(score.toFixed(4)),
    aPlus: grade === 'A+' && !hardFail,
    hardFail,
    pillars,
    ok: grade === 'A+' && !hardFail,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseJsonArg(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  const jsonOut = argv.includes('--json');
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Usage:
  node tools/production-ops.js scorecard [--json]
  node tools/production-ops.js validate-usage --json '<usage>'
  node tools/production-ops.js validate-structured --schema '<schema>' --data '<data>'
  node tools/production-ops.js filter-acl --acl <path|json> --principal org:x --paths a,b
  node tools/production-ops.js faithfulness --answer '...' --sources '["..."]' [--query '...']
  node tools/production-ops.js write-trace --trace '<json>' [--dir DIR]
`);
    process.exit(0);
  }

  if (cmd === 'scorecard') {
    const report = scoreProductionPillars();
    if (jsonOut) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Production ops grade: ${report.grade} (score=${report.score}${report.hardFail ? ', hard-fail' : ''})`);
      for (const p of report.pillars) {
        console.log(`  ${p.ok ? 'OK' : 'FAIL'} ${p.id}: ${p.detail}`);
      }
    }
    process.exit(report.ok ? 0 : 1);
  }

  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (cmd === 'validate-usage') {
    const raw = get('--json') || get('--usage') || '{}';
    const res = normalizeUsage(parseJsonArg(raw, 'usage'));
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 2);
  }

  if (cmd === 'validate-structured') {
    const schema = parseJsonArg(get('--schema') || '{}', 'schema');
    const data = parseJsonArg(get('--data') || 'null', 'data');
    const res = validateStructured(data, schema);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 2);
  }

  if (cmd === 'filter-acl') {
    const principal = get('--principal') || '';
    const paths = String(get('--paths') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => ({ path: p }));
    let acl = get('--acl');
    if (acl && acl.trim().startsWith('{')) acl = parseJsonArg(acl, 'acl');
    else if (acl) acl = loadAcl(acl);
    const res = filterMatchesByAcl(paths, principal, acl);
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }

  if (cmd === 'faithfulness') {
    const answer = get('--answer') || '';
    const sources = parseJsonArg(get('--sources') || '[]', 'sources');
    const query = get('--query') || '';
    const res = runtimeFaithfulnessGate(answer, sources, { query });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.pass ? 0 : 2);
  }

  if (cmd === 'write-trace') {
    const traceIn = parseJsonArg(get('--trace') || '{}', 'trace');
    const built = buildTurnTrace(traceIn);
    const file = writeTurnTrace(built, { dir: get('--dir') });
    console.log(JSON.stringify({ ok: built.ok, file, id: built.id }, null, 2));
    process.exit(built.ok ? 0 : 2);
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}

module.exports = {
  USAGE_SCHEMA,
  TRACE_SCHEMA,
  ACL_SCHEMA,
  normalizeUsage,
  estimateCostUsd,
  enrichReceiptWithUsage,
  buildTurnTrace,
  writeTurnTrace,
  loadAcl,
  checkDocumentAccess,
  filterMatchesByAcl,
  pathMatchesPattern,
  validateStructured,
  runtimeFaithfulnessGate,
  scoreProductionPillars,
  main,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
