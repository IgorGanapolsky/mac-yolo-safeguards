#!/usr/bin/env node
'use strict';

/**
 * Rubrik Mythos triage harness — high-ROI steal from
 * https://thenewstack.io/rubrik-mythos-learnings/ (Arvind Nithrakashyap, Aug 2026)
 *
 * Transferable ideas (not a Mythos clone):
 *   1. AI discovery outruns human review — do not hire more reviewers; filter.
 *   2. Harness owns tool-call checkpoints (file-hash resume) + trust boundaries.
 *   3. Progressive passes: whole-repo → reachability/context → two-track dispatch.
 *   4. Automate only a tightly-scoped subset. Secrets, eval, path traversal,
 *      and cross-file taint chains stay on the engineer queue.
 *
 * Local-only scan. $10/mo metered ceiling is fail-closed (no paid API in this path).
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DEFAULT_STATE_DIR = path.join(HOME, '.hermes', 'rubrik-mythos');
const MONTHLY_BUDGET_USD = 10;

const RULES = Object.freeze([
  {
    id: 'CYBER-001-CMD-INJECTION',
    name: 'Command injection via unsanitized shell execution',
    severity: 'HIGH',
    cwe: 'CWE-78',
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*(?:`[^`]*\$\{[^}]+\}[^`]*`|(?:[A-Za-z_][\w.]*|["'][^"']*["'])\s*\+)/,
    remediable: true,
    remediation: 'Use spawnSync with an argument array, never a concatenated shell string.',
  },
  {
    id: 'CYBER-002-SQL-INJECTION',
    name: 'SQL injection via template concatenation',
    severity: 'HIGH',
    cwe: 'CWE-89',
    pattern: /(?:query|execute)\s*\(\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}[^`]*`/i,
    remediable: true,
    remediation: 'Use parameterized queries.',
  },
  {
    id: 'CYBER-003-HARDCODED-SECRET',
    name: 'Hardcoded secret in source',
    severity: 'CRITICAL',
    cwe: 'CWE-798',
    pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"](?:sk-|ghp_|xai-)[A-Za-z0-9_-]{16,}['"]/i,
    remediable: false,
    remediation: 'Rotate and load from Keychain/env. Never rewrite the secret in place.',
  },
  {
    id: 'CYBER-004-DANGEROUS-EVAL',
    name: 'eval / Function constructor',
    severity: 'CRITICAL',
    cwe: 'CWE-95',
    pattern: /\b(?:eval|Function)\s*\(/,
    remediable: false,
    remediation: 'Replace with JSON.parse or a deterministic parser.',
  },
  {
    id: 'CYBER-005-PATH-TRAVERSAL',
    name: 'Path traversal from request input',
    severity: 'MEDIUM',
    cwe: 'CWE-22',
    pattern: /(?:readFileSync|readFile|createReadStream|unlinkSync)\s*\(\s*(?:req\.|path\.join\([^)]*req\.)/,
    remediable: false,
    remediation: 'Normalize with path.basename and confine to a safe root.',
  },
  {
    id: 'CYBER-006-INSECURE-CORS',
    name: 'Wildcard CORS origin',
    severity: 'MEDIUM',
    cwe: 'CWE-942',
    pattern: /Access-Control-Allow-Origin[\s'",:]+?\*/,
    remediable: true,
    remediation: 'Allow only explicit trusted origins.',
  },
]);

const SAFE_AUTOMATED_REMEDIATION_CLASSES = new Set([
  'CYBER-001-CMD-INJECTION',
  'CYBER-002-SQL-INJECTION',
  'CYBER-006-INSECURE-CORS',
]);

const UNTRUSTED_RE = /\b(req\.(?:query|body|params)|process\.argv|userInput|payload)\b/;
const TAINT_TOKEN_RE = /\b(req\.(?:query|body|params)\.\w+|process\.argv|userInput|payload)\b/g;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'artifacts', '.worktrees']);

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function classifyTrustBoundary(snippet = '') {
  return UNTRUSTED_RE.test(snippet) ? 'UNTRUSTED_ENTRY' : 'INTERNAL';
}

function extractTaintTokens(snippet = '') {
  const tokens = [];
  const re = new RegExp(TAINT_TOKEN_RE.source, 'g');
  let match;
  while ((match = re.exec(snippet))) tokens.push(match[1]);
  return tokens;
}

function isTestOrFixture(filePath = '', scanRoot = '') {
  const rel = scanRoot ? path.relative(scanRoot, filePath) : filePath;
  return /(?:^|\/)(?:test|tests|__tests__|fixtures|specs?)(?:\/|$)|(?:\.test|\.spec)\.[jt]sx?$/i.test(rel);
}

function isComment(snippet = '') {
  return /^\s*(?:\/\/|\/\*|\*|#)/.test(snippet);
}

function synthesizePatch(finding) {
  if (finding.id === 'CYBER-001-CMD-INJECTION') {
    return {
      vulnerabilityId: finding.id,
      patchedSnippet: 'spawnSync("git", args, { encoding: "utf8" });',
      patchDescription: 'Replace concatenated shell with a parameterized argv vector.',
      autoApplyAllowed: true,
    };
  }
  if (finding.id === 'CYBER-002-SQL-INJECTION') {
    return {
      vulnerabilityId: finding.id,
      patchedSnippet: 'db.query("SELECT * FROM t WHERE id = $1", [id]);',
      patchDescription: 'Replace template SQL with a parameterized query.',
      autoApplyAllowed: true,
    };
  }
  if (finding.id === 'CYBER-006-INSECURE-CORS') {
    return {
      vulnerabilityId: finding.id,
      patchedSnippet: "res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);",
      patchDescription: 'Replace wildcard CORS with an explicit origin.',
      autoApplyAllowed: true,
    };
  }
  return {
    vulnerabilityId: finding.id,
    patchedSnippet: null,
    patchDescription: finding.remediation,
    autoApplyAllowed: false,
  };
}

class RubrikMythosTriageHarness {
  constructor(options = {}) {
    this.stateDir = options.stateDir || DEFAULT_STATE_DIR;
    this.checkpointPath = options.checkpointPath || path.join(this.stateDir, 'checkpoint.json');
    this.queuePath = options.queuePath || path.join(this.stateDir, 'escalation-queue.json');
    this.monthlyBudgetUsd = MONTHLY_BUDGET_USD;
    this.maxFiles = options.maxFiles || 200;
  }

  loadCheckpoint() {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        return JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
      }
    } catch { /* empty checkpoint */ }
    return { schema: 'rubrik-mythos-checkpoint/v1', files: {}, updatedAt: null };
  }

  saveCheckpoint(checkpoint) {
    fs.mkdirSync(path.dirname(this.checkpointPath), { recursive: true, mode: 0o700 });
    const payload = { ...checkpoint, updatedAt: new Date().toISOString() };
    fs.writeFileSync(this.checkpointPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    return payload;
  }

  loadEscalationQueue() {
    try {
      if (fs.existsSync(this.queuePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.queuePath, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* empty */ }
    return [];
  }

  saveEscalationQueue(items) {
    const existing = this.loadEscalationQueue();
    const byKey = new Map();
    for (const item of existing) {
      byKey.set(item.dedupeKey || `${item.context?.file}:${item.context?.line}:${item.finding?.id}`, item);
    }
    for (const item of items) {
      byKey.set(item.dedupeKey, item);
    }
    const combined = Array.from(byKey.values()).slice(-200);
    fs.mkdirSync(path.dirname(this.queuePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.queuePath, `${JSON.stringify(combined, null, 2)}\n`, { mode: 0o600 });
    return combined;
  }

  walkSourceFiles(dirPath) {
    const files = [];
    const walk = (current) => {
      if (files.length >= this.maxFiles || !fs.existsSync(current)) return;
      const stat = fs.statSync(current);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(current)) {
          if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
          walk(path.join(current, entry));
        }
        return;
      }
      if (stat.isFile() && /\.(js|ts|tsx|jsx|mjs)$/.test(current)) files.push(current);
    };
    walk(dirPath);
    return files.slice(0, this.maxFiles);
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const findings = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            id: rule.id,
            name: rule.name,
            severity: rule.severity,
            cwe: rule.cwe,
            remediable: rule.remediable,
            remediation: rule.remediation,
            line: i + 1,
            snippet: line.trim().slice(0, 200),
            trustBoundary: classifyTrustBoundary(line),
            taintTokens: extractTaintTokens(line),
          });
        }
      }
    }
    return { filename: filePath, contentSha256: sha256(content), findings };
  }

  /**
   * Pass 1 — whole-repo scan with file-hash checkpoints (skip unchanged).
   */
  broadRepoScan(dirPath, options = {}) {
    const checkpoint = this.loadCheckpoint();
    const files = this.walkSourceFiles(dirPath);
    const results = [];
    let skippedUnchanged = 0;
    let filesScanned = 0;
    let totalVulnerabilities = 0;
    const nextFiles = { ...checkpoint.files };

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const digest = sha256(content);
      const rel = path.relative(dirPath, filePath) || filePath;
      if (!options.force && checkpoint.files[rel] === digest) {
        skippedUnchanged += 1;
        continue;
      }
      const scanned = this.scanFile(filePath);
      filesScanned += 1;
      totalVulnerabilities += scanned.findings.length;
      nextFiles[rel] = digest;
      if (scanned.findings.length) results.push(scanned);
    }

    this.saveCheckpoint({ schema: 'rubrik-mythos-checkpoint/v1', files: nextFiles });
    return {
      targetDirectory: dirPath,
      filesConsidered: files.length,
      filesScanned,
      skippedUnchanged,
      totalVulnerabilities,
      results,
    };
  }

  /**
   * Pass 2 — trust-boundary + reachability + fixture prune.
   */
  reachabilityFilter(pass1Results) {
    const reachableFindings = [];
    let noiseFilteredCount = 0;
    const totalCandidates = pass1Results.totalVulnerabilities;

    const scanRoot = pass1Results.targetDirectory || '';
    for (const fileResult of pass1Results.results) {
      const testFile = isTestOrFixture(fileResult.filename, scanRoot);
      for (const finding of fileResult.findings) {
        if (testFile && finding.severity !== 'CRITICAL') {
          noiseFilteredCount += 1;
          continue;
        }
        if (isComment(finding.snippet) && finding.id !== 'CYBER-003-HARDCODED-SECRET') {
          noiseFilteredCount += 1;
          continue;
        }

        const untrusted = finding.trustBoundary === 'UNTRUSTED_ENTRY';
        const alwaysActionable = finding.id === 'CYBER-003-HARDCODED-SECRET'
          || finding.id === 'CYBER-004-DANGEROUS-EVAL'
          || finding.id === 'CYBER-006-INSECURE-CORS';
        if (!untrusted && !alwaysActionable) {
          noiseFilteredCount += 1;
          continue;
        }

        reachableFindings.push({
          ...finding,
          file: fileResult.filename,
          isReachable: true,
          reachabilityScore: untrusted ? 0.95 : 0.8,
        });
      }
    }

    return {
      totalCandidates,
      actionableFindingsCount: reachableFindings.length,
      noiseFilteredCount,
      noiseReductionRate: totalCandidates > 0
        ? Number(((noiseFilteredCount / totalCandidates) * 100).toFixed(1))
        : 0,
      reachableFindings,
    };
  }

  /**
   * Cross-file taint chains — the Mythos finding class humans cannot keep up with.
   * Any token that appears in 2+ production files is a chain → Track B.
   */
  detectCrossComponentChains(reachableFindings) {
    const byToken = new Map();
    for (const finding of reachableFindings) {
      for (const token of finding.taintTokens || []) {
        if (!byToken.has(token)) byToken.set(token, []);
        byToken.get(token).push(finding);
      }
    }
    const chainKeys = new Set();
    const chains = [];
    for (const [token, items] of byToken.entries()) {
      const files = new Set(items.map((item) => item.file));
      if (files.size >= 2) {
        chains.push({ token, files: Array.from(files), count: items.length });
        for (const item of items) chainKeys.add(`${item.file}:${item.line}:${item.id}`);
      }
    }
    return { chains, chainKeys };
  }

  /**
   * Pass 3 — two-track dispatch. Chains and non-allowlisted classes never auto-fix.
   */
  twoTrackDispatch(pass2Results) {
    const { chains, chainKeys } = this.detectCrossComponentChains(pass2Results.reachableFindings);
    const trackA = [];
    const trackB = [];

    for (const finding of pass2Results.reachableFindings) {
      const key = `${finding.file}:${finding.line}:${finding.id}`;
      const isChain = chainKeys.has(key);
      const allowAuto = SAFE_AUTOMATED_REMEDIATION_CLASSES.has(finding.id)
        && finding.remediable
        && !isChain;

      if (allowAuto) {
        trackA.push({
          finding,
          patch: synthesizePatch(finding),
          track: 'TRACK_A_SAFE_AUTO_REMEDIATION',
          confidence: 'HIGH',
          status: 'READY_TO_APPLY',
        });
        continue;
      }

      const packet = {
        incidentId: `INC-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
        dedupeKey: key,
        finding,
        track: 'TRACK_B_ENGINEER_ESCALATION',
        requiresHumanReview: true,
        reason: isChain ? 'cross-component-taint-chain' : 'not-in-safe-auto-class',
        timestamp: new Date().toISOString(),
        context: {
          file: finding.file,
          line: finding.line,
          snippet: finding.snippet,
          trustBoundary: finding.trustBoundary,
          reachabilityScore: finding.reachabilityScore,
          recommendedAction: finding.remediation,
          chain: isChain,
        },
      };
      trackB.push(packet);
    }

    this.saveEscalationQueue(trackB);
    return {
      totalActionable: pass2Results.actionableFindingsCount,
      trackA_AutoRemediationCount: trackA.length,
      trackB_EngineerEscalationCount: trackB.length,
      trackA_Items: trackA,
      trackB_Items: trackB,
      crossComponentChains: chains,
    };
  }

  runTriagePipeline(dirPath, options = {}) {
    const pass1 = this.broadRepoScan(dirPath, options);
    const pass2 = this.reachabilityFilter(pass1);
    const pass3 = this.twoTrackDispatch(pass2);
    return {
      pipeline: 'Rubrik-Mythos 3-pass + checkpoint + trust-boundary + chain filter',
      source: 'https://thenewstack.io/rubrik-mythos-learnings/',
      targetDirectory: dirPath,
      timestamp: new Date().toISOString(),
      budgetCeilingUsd: this.monthlyBudgetUsd,
      meteredApiAllowed: false,
      pass1_BroadScan: {
        filesScanned: pass1.filesScanned,
        filesConsidered: pass1.filesConsidered,
        skippedUnchanged: pass1.skippedUnchanged,
        rawCandidatesFound: pass1.totalVulnerabilities,
      },
      pass2_ReachabilityFilter: {
        actionableCount: pass2.actionableFindingsCount,
        noiseFiltered: pass2.noiseFilteredCount,
        noiseReductionPercent: `${pass2.noiseReductionRate}%`,
      },
      pass3_TwoTrackTriage: {
        trackA_SafeAutoFixed: pass3.trackA_AutoRemediationCount,
        trackB_EngineerEscalated: pass3.trackB_EngineerEscalationCount,
        crossComponentChains: pass3.crossComponentChains.length,
      },
      trackA_Patches: pass3.trackA_Items,
      trackB_Escalations: pass3.trackB_Items,
      crossComponentChains: pass3.crossComponentChains,
    };
  }

  runDoctor() {
    const queue = this.loadEscalationQueue();
    const checkpoint = this.loadCheckpoint();
    return {
      harness: 'Rubrik-Mythos checkpoint + two-track triage',
      version: '2.0.0',
      source: 'https://thenewstack.io/rubrik-mythos-learnings/',
      tokenBudgetGuard: {
        monthlyCapUsd: this.monthlyBudgetUsd,
        currentSpentUsd: 0,
        remainingBudgetUsd: this.monthlyBudgetUsd,
        pacingStatus: 'GREEN',
        allowPaid: false,
      },
      triageArchitecture: {
        pass1: 'Whole-repo scan with file-hash checkpoints',
        pass2: 'Trust-boundary + reachability + fixture prune',
        pass3: 'Two-track dispatch; chains and secrets never auto-fixed',
      },
      safeRemediationClassesCount: SAFE_AUTOMATED_REMEDIATION_CLASSES.size,
      pendingEngineerEscalationsCount: queue.length,
      checkpointedFiles: Object.keys(checkpoint.files || {}).length,
      status: 'OPERATIONAL',
    };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const force = argv.includes('--force');
  const command = argv.find((a) => !a.startsWith('--')) || 'doctor';
  const harness = new RubrikMythosTriageHarness();

  if (command === 'doctor' || argv.includes('--doctor')) {
    const doc = harness.runDoctor();
    console.log(jsonMode ? JSON.stringify(doc, null, 2) : [
      `Rubrik Mythos triage: ${doc.status}`,
      `  budget: $${doc.tokenBudgetGuard.monthlyCapUsd}/mo (metered API disabled)`,
      `  safe auto classes: ${doc.safeRemediationClassesCount}`,
      `  Track B queue: ${doc.pendingEngineerEscalationsCount}`,
      `  checkpointed files: ${doc.checkpointedFiles}`,
    ].join('\n'));
    return;
  }

  if (command === 'queue' || argv.includes('--queue')) {
    const queue = harness.loadEscalationQueue();
    if (jsonMode) {
      console.log(JSON.stringify(queue, null, 2));
      return;
    }
    console.log(`Track B queue (${queue.length})`);
    for (const item of queue) {
      console.log(`  ${item.incidentId} ${item.finding.id} ${item.context.file}:${item.context.line} (${item.reason})`);
    }
    return;
  }

  const target = (command === 'scan' ? argv[1] : command) && !String(command === 'scan' ? argv[1] : command).startsWith('--')
    ? (command === 'scan' ? argv[1] : command)
    : process.cwd();
  const report = harness.runTriagePipeline(target, { force });
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Rubrik 3-pass triage: ${target}`);
  console.log(`  pass1: ${report.pass1_BroadScan.rawCandidatesFound} raw (${report.pass1_BroadScan.skippedUnchanged} checkpoint-skipped)`);
  console.log(`  pass2: ${report.pass2_ReachabilityFilter.actionableCount} actionable (${report.pass2_ReachabilityFilter.noiseReductionPercent} noise)`);
  console.log(`  pass3: Track A ${report.pass3_TwoTrackTriage.trackA_SafeAutoFixed} / Track B ${report.pass3_TwoTrackTriage.trackB_EngineerEscalated} / chains ${report.pass3_TwoTrackTriage.crossComponentChains}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  MONTHLY_BUDGET_USD,
  RULES,
  RubrikMythosTriageHarness,
  SAFE_AUTOMATED_REMEDIATION_CLASSES,
  classifyTrustBoundary,
  extractTaintTokens,
  synthesizePatch,
};
