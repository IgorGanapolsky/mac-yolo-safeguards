#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = 'hermes-codex-security-gate/v1';
const DEFAULT_RECEIPT_DIR = path.join(os.homedir(), '.hermes', 'receipts', 'codex-security');
const CODEX_SECURITY_VERSION = '0.1.3';
const MAX_SARIF_BYTES = 50 * 1024 * 1024;
const SEVERITY = Object.freeze({ none: 0, note: 0, low: 1, medium: 2, high: 3, critical: 4 });

function digest(value) {
  return crypto.createHash('sha256').update(
    Buffer.isBuffer(value) ? value : String(value),
  ).digest('hex');
}

function readJsonFile(filePath, maxBytes = MAX_SARIF_BYTES) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('input must be a regular file');
  if (stat.size > maxBytes) throw new Error(`input exceeds ${maxBytes} bytes`);
  const bytes = fs.readFileSync(resolved);
  return { resolved, bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function normalizeSeverity(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (SEVERITY[raw] != null) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric >= 9) return 'critical';
    if (numeric >= 7) return 'high';
    if (numeric >= 4) return 'medium';
    if (numeric > 0) return 'low';
  }
  if (raw === 'error') return 'high';
  if (raw === 'warning') return 'medium';
  return 'note';
}

function ruleMap(run) {
  const rules = run?.tool?.driver?.rules || [];
  return new Map(rules.map((rule) => [rule.id, rule]));
}

function resultSeverity(result, rule) {
  return normalizeSeverity(
    result?.properties?.severity
      || result?.properties?.securitySeverity
      || rule?.properties?.severity
      || rule?.properties?.securitySeverity
      || result?.level,
  );
}

function resultFingerprint(result) {
  const fingerprints = result.partialFingerprints || result.fingerprints || {};
  const stable = Object.entries(fingerprints)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
  if (stable) return digest(stable);
  const location = result.locations?.[0]?.physicalLocation;
  const uri = location?.artifactLocation?.uri || '';
  const message = String(result.message?.text || result.message?.markdown || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return digest(`${result.ruleId || 'unknown'}\n${uri}\n${message}`);
}

function parseSarif(sarif) {
  if (!sarif || sarif.version !== '2.1.0' || !Array.isArray(sarif.runs)) {
    throw new Error('candidate must be SARIF 2.1.0');
  }
  const findings = [];
  for (const run of sarif.runs) {
    const rules = ruleMap(run);
    for (const result of run.results || []) {
      const rule = rules.get(result.ruleId);
      findings.push({
        fingerprint: resultFingerprint(result),
        ruleId: String(result.ruleId || 'unknown'),
        severity: resultSeverity(result, rule),
      });
    }
  }
  const deduped = new Map();
  for (const finding of findings) {
    const prior = deduped.get(finding.fingerprint);
    if (!prior || SEVERITY[finding.severity] > SEVERITY[prior.severity]) {
      deduped.set(finding.fingerprint, finding);
    }
  }
  return [...deduped.values()];
}

function severityCounts(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, note: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function evaluateSarif(options = {}) {
  const threshold = normalizeSeverity(options.threshold || 'high');
  if (SEVERITY[threshold] < SEVERITY.low) throw new Error('threshold must be critical, high, medium, or low');
  const candidateInput = readJsonFile(options.candidatePath);
  const baselineInput = options.baselinePath ? readJsonFile(options.baselinePath) : null;
  const candidate = parseSarif(candidateInput.value);
  const baseline = baselineInput ? parseSarif(baselineInput.value) : [];
  const candidateMap = new Map(candidate.map((finding) => [finding.fingerprint, finding]));
  const baselineMap = new Map(baseline.map((finding) => [finding.fingerprint, finding]));
  const newFindings = candidate.filter((finding) => !baselineMap.has(finding.fingerprint));
  const resolved = baseline.filter((finding) => !candidateMap.has(finding.fingerprint));
  const persisting = candidate.filter((finding) => baselineMap.has(finding.fingerprint));
  const blocking = newFindings.filter(
    (finding) => SEVERITY[finding.severity] >= SEVERITY[threshold],
  );
  return {
    schema: SCHEMA,
    generatedAt: options.now || new Date().toISOString(),
    status: blocking.length ? 'fail' : 'pass',
    securityVerified: true,
    threshold,
    inputs: {
      candidateDigest: digest(candidateInput.bytes),
      baselineDigest: baselineInput ? digest(baselineInput.bytes) : null,
    },
    counts: {
      candidate: candidate.length,
      baseline: baseline.length,
      new: newFindings.length,
      resolved: resolved.length,
      persisting: persisting.length,
      blockingNew: blocking.length,
      candidateBySeverity: severityCounts(candidate),
      newBySeverity: severityCounts(newFindings),
    },
    blockingRuleIds: [...new Set(blocking.map((finding) => finding.ruleId))].sort(),
  };
}

function extractJsonEnvelope(output) {
  const text = String(output || '');
  for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
    try {
      return JSON.parse(text.slice(index));
    } catch {
      // Keep walking backward through progress output.
    }
  }
  throw new Error('Codex Security output did not contain a JSON envelope');
}

function classifyPreflightEnvelope(envelope, options = {}) {
  const data = envelope?.data || {};
  const authentication = data.authentication || {};
  const readinessOk = envelope?.ok === true && data.dryRun === true;
  return {
    schema: SCHEMA,
    generatedAt: options.now || new Date().toISOString(),
    status: readinessOk ? 'blocked' : 'fail',
    securityVerified: false,
    readiness: readinessOk ? 'pass' : 'fail',
    reason: readinessOk ? 'dry_run_only_no_security_findings_were_scanned' : 'preflight_failed',
    codexSecurity: {
      version: CODEX_SECURITY_VERSION,
      repository: data.repository || null,
      targetKind: data.target?.kind || null,
      authenticationMethod: authentication.method || null,
      authenticationVerified: authentication.verified === true,
      model: data.model || null,
      reasoningEffort: data.reasoningEffort || null,
      maxCostUsd: Number.isFinite(Number(data.maxCostUsd)) ? Number(data.maxCostUsd) : null,
    },
  };
}

function runPreflight(options = {}) {
  const repo = path.resolve(options.repo || process.cwd());
  const args = [
    '--yes',
    `@openai/codex-security@${CODEX_SECURITY_VERSION}`,
    'scan',
    repo,
    '--dry-run',
    '--diff',
    options.base || 'origin/main',
    '--head',
    options.head || 'HEAD',
    '--max-cost',
    String(options.maxCostUsd ?? 0.5),
    '--format',
    'json',
    '--full-output',
  ];
  const result = spawnSync('npx', args, {
    cwd: repo,
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      schema: SCHEMA,
      generatedAt: options.now || new Date().toISOString(),
      status: 'fail',
      securityVerified: false,
      readiness: 'fail',
      reason: `codex_security_preflight_exit_${result.status}`,
    };
  }
  return classifyPreflightEnvelope(extractJsonEnvelope(result.stdout), options);
}

function writeReceipt(receipt, options = {}) {
  const receiptDir = path.resolve(options.receiptDir || DEFAULT_RECEIPT_DIR);
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(receiptDir, 0o700);
  const id = `gate_${receipt.generatedAt.replace(/[-:.TZ]/g, '').slice(0, 17)}_${digest(JSON.stringify(receipt)).slice(0, 12)}`;
  const immutablePath = path.join(receiptDir, `${id}.json`);
  fs.writeFileSync(immutablePath, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  const latestPath = path.join(receiptDir, 'latest.json');
  const tempPath = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, latestPath);
  fs.chmodSync(latestPath, 0o600);
  const historyPath = path.join(receiptDir, 'history.jsonl');
  fs.appendFileSync(historyPath, `${JSON.stringify({
    generatedAt: receipt.generatedAt,
    status: receipt.status,
    securityVerified: receipt.securityVerified,
    threshold: receipt.threshold || null,
    counts: receipt.counts || null,
    reason: receipt.reason || null,
  })}\n`, { mode: 0o600 });
  fs.chmodSync(historyPath, 0o600);
  return { immutablePath, latestPath, historyPath };
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    command: argv[0] || 'help',
    candidatePath: null,
    baselinePath: null,
    threshold: 'high',
    repo: process.cwd(),
    base: 'origin/main',
    head: 'HEAD',
    maxCostUsd: 0.5,
    receiptDir: DEFAULT_RECEIPT_DIR,
    noWrite: false,
    json: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--candidate') args.candidatePath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--baseline') args.baselinePath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--threshold') args.threshold = requireValue(argv, ++index, arg);
    else if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--base') args.base = requireValue(argv, ++index, arg);
    else if (arg === '--head') args.head = requireValue(argv, ++index, arg);
    else if (arg === '--max-cost') args.maxCostUsd = Number(requireValue(argv, ++index, arg));
    else if (arg === '--receipt-dir') args.receiptDir = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--no-write') args.noWrite = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node tools/codex-security-gate.js preflight [--repo PATH] [--base REF] [--head REF]
  node tools/codex-security-gate.js evaluate --candidate REPORT.sarif
    [--baseline BASELINE.sarif] [--threshold high] [--receipt-dir PATH]

Preflight is deliberately not a security pass: it validates the pinned official
CLI contract at zero scan cost and exits 2. Evaluate compares exported SARIF
findings by stable fingerprint and exits 1 only for new findings at or above the
threshold. Receipts contain counts and digests, never finding text or source.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let receipt;
  if (args.command === 'preflight') {
    receipt = runPreflight(args);
  } else if (args.command === 'evaluate') {
    if (!args.candidatePath) throw new Error('evaluate requires --candidate');
    receipt = evaluateSarif(args);
  } else {
    console.log(usage());
    return { help: true };
  }
  const artifacts = args.noWrite ? null : writeReceipt(receipt, args);
  const result = { ...receipt, artifacts };
  console.log(args.json ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  if (receipt.status === 'fail') process.exitCode = 1;
  else if (!receipt.securityVerified) process.exitCode = 2;
  return result;
}

module.exports = {
  CODEX_SECURITY_VERSION,
  SCHEMA,
  classifyPreflightEnvelope,
  evaluateSarif,
  extractJsonEnvelope,
  normalizeSeverity,
  parseSarif,
  resultFingerprint,
  runPreflight,
  writeReceipt,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 2;
  }
}
