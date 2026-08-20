#!/usr/bin/env node
'use strict';

/**
 * Island Agentic Endpoint Posture steal (local fleet ops).
 *
 * Source: https://www.island.io/ai — "Discovers every MCP server, skill, and
 * extension… risk-scores what's running."
 *
 * What we implement: offline inventory + deterministic risk score for
 * `.mcp.json` servers and each `.agents/skills/<name>/SKILL.md`.
 *
 * What this is NOT: Island Enterprise Browser, MCP Gateway product, NHI IdP,
 * or net-new ThumbGate governance SKU (ECI pause still applies to that lane).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadMcpConfig, classifyServer, SERVER_META } = require('./mcp-health-check');

const REPO = path.resolve(__dirname, '..');
const SOURCE = 'https://www.island.io/ai';

const HIGH_BLAST = /\b(send|write|delete|exec|shell|payment|stripe|email|gmail|adb|deploy|force.?push|secret|keychain)\b/i;
const WRITE_HINT = /\b(write|mutate|send|post|publish|delete|exec)\b/i;

function parseArgs(argv) {
  const args = { json: false, help: false, failOn: 'critical' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--fail-on') {
      args.failOn = String(argv[++i] || '').toLowerCase();
      if (!['critical', 'high', 'none'].includes(args.failOn)) {
        throw new Error('--fail-on must be critical|high|none');
      }
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function scoreMcpServer(row) {
  let score = 10;
  const reasons = [];

  if (!(row.name in SERVER_META)) {
    score += 35;
    reasons.push('unlisted_in_SERVER_META');
  }
  if (!row.healthy) {
    score += 25;
    reasons.push('config_unhealthy');
  }
  if (String(row.locality).includes('remote')) {
    score += 15;
    reasons.push('remote_transport');
  }
  if (/unknown/i.test(String(row.secret))) {
    score += 20;
    reasons.push('secret_unknown');
  } else if (!/none/i.test(String(row.secret))) {
    score += 10;
    reasons.push('requires_secret');
  }
  if (HIGH_BLAST.test(`${row.blastRadius} ${row.scope}`)) {
    score += 20;
    reasons.push('high_blast_keywords');
  }
  if (WRITE_HINT.test(`${row.blastRadius} ${row.scope}`)) {
    score += 10;
    reasons.push('write_or_send_capability');
  }

  score = Math.min(100, score);
  return {
    kind: 'mcp',
    id: row.name,
    locality: row.locality,
    scope: row.scope,
    healthy: row.healthy,
    riskScore: score,
    riskBand: bandFor(score),
    reasons,
  };
}

function bandFor(score) {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function listSkillDirs(root = REPO) {
  const base = path.join(root, '.agents', 'skills');
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(base, d.name));
}

function scoreSkill(skillDir) {
  const name = path.basename(skillDir);
  const skillMd = path.join(skillDir, 'SKILL.md');
  const cardMd = path.join(skillDir, 'skill-card.md');
  let score = 5;
  const reasons = [];
  let description = '';
  let hasFrontmatter = false;

  if (!fs.existsSync(skillMd)) {
    return {
      kind: 'skill',
      id: name,
      riskScore: 80,
      riskBand: 'critical',
      reasons: ['missing_SKILL_md'],
      hasSkillCard: false,
    };
  }

  const body = fs.readFileSync(skillMd, 'utf8');
  hasFrontmatter = body.startsWith('---');
  const descMatch = body.match(/^description:\s*[>|]?\s*(.+)$/m) || body.match(/^description:\s*>\s*\n\s*(.+)$/m);
  if (descMatch) description = descMatch[1].trim().slice(0, 160);
  else {
    const plain = body.match(/^#\s+.+\n+([^\n]+)/);
    description = plain ? plain[1].trim().slice(0, 160) : '';
  }

  if (!hasFrontmatter) {
    score += 15;
    reasons.push('missing_yaml_frontmatter');
  }
  if (!description) {
    score += 20;
    reasons.push('missing_description');
  }
  const hasCard = fs.existsSync(cardMd);
  if (!hasCard) {
    score += 10;
    reasons.push('missing_skill_card');
  }
  if (HIGH_BLAST.test(body)) {
    score += 25;
    reasons.push('high_blast_keywords_in_skill');
  }
  if (/\b(auto-send|auto.?publish|force.?push|rm\s+-rf)\b/i.test(body)) {
    score += 20;
    reasons.push('destructive_automation_language');
  }
  if (/\bECI\b|\bnet-new agent-governance\b/i.test(body) && /\bpause\b/i.test(body)) {
    score = Math.max(0, score - 5);
    reasons.push('documents_eci_pause');
  }

  score = Math.min(100, score);
  return {
    kind: 'skill',
    id: name,
    description,
    hasSkillCard: hasCard,
    riskScore: score,
    riskBand: bandFor(score),
    reasons,
  };
}

function inventoryEndpointPosture(options = {}) {
  const root = options.root || REPO;
  const loaded = loadMcpConfig();
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      mcp: [],
      skills: [],
    };
  }

  // Re-load against optional root (tests)
  let servers = loaded.servers;
  if (root !== REPO) {
    const mcpPath = path.join(root, '.mcp.json');
    try {
      servers = JSON.parse(fs.readFileSync(mcpPath, 'utf8')).mcpServers || {};
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        mcp: [],
        skills: [],
      };
    }
  }

  const mcp = Object.entries(servers).map(([name, config]) =>
    scoreMcpServer(classifyServer(name, config || {})),
  );
  const skills = listSkillDirs(root).map(scoreSkill);

  const critical = [...mcp, ...skills].filter((x) => x.riskBand === 'critical');
  const high = [...mcp, ...skills].filter((x) => x.riskBand === 'high');

  const receipt = {
    id: `island-posture-${crypto.randomBytes(6).toString('hex')}`,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    mcpCount: mcp.length,
    skillCount: skills.length,
    criticalCount: critical.length,
    highCount: high.length,
    fingerprint: crypto
      .createHash('sha256')
      .update(
        JSON.stringify(
          [...mcp, ...skills]
            .map((x) => ({ id: x.id, kind: x.kind, riskScore: x.riskScore }))
            .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
        ),
      )
      .digest('hex')
      .slice(0, 16),
  };

  return {
    ok: critical.length === 0,
    source: SOURCE,
    receipt,
    mcp: mcp.sort((a, b) => b.riskScore - a.riskScore),
    skills: skills.sort((a, b) => b.riskScore - a.riskScore),
    summary: {
      mcpCount: mcp.length,
      skillCount: skills.length,
      criticalCount: critical.length,
      highCount: high.length,
      mediumCount: [...mcp, ...skills].filter((x) => x.riskBand === 'medium').length,
      lowCount: [...mcp, ...skills].filter((x) => x.riskBand === 'low').length,
    },
  };
}

function exitCodeFor(report, failOn) {
  if (failOn === 'none') return 0;
  if (failOn === 'high') {
    return report.summary.criticalCount + report.summary.highCount > 0 ? 1 : 0;
  }
  return report.summary.criticalCount > 0 ? 1 : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node tools/island-endpoint-posture.js [--json] [--fail-on critical|high|none]\n' +
        'Island Agentic Endpoint Posture steal: MCP + skill inventory with risk bands.',
    );
    process.exit(0);
  }
  const report = inventoryEndpointPosture();
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (!report.ok && report.error) {
      console.error(report.error);
      process.exit(2);
    }
    console.log(
      `Island endpoint posture: mcp=${report.summary.mcpCount} skills=${report.summary.skillCount} ` +
        `critical=${report.summary.criticalCount} high=${report.summary.highCount} ` +
        `receipt=${report.receipt.id} fp=${report.receipt.fingerprint}`,
    );
    for (const row of report.mcp.slice(0, 12)) {
      console.log(`  mcp  ${row.riskBand.padEnd(8)} ${String(row.riskScore).padStart(3)} ${row.id} - ${row.reasons.join(',') || 'ok'}`);
    }
    for (const row of report.skills.filter((s) => s.riskBand !== 'low').slice(0, 12)) {
      console.log(`  skill ${row.riskBand.padEnd(8)} ${String(row.riskScore).padStart(3)} ${row.id} - ${row.reasons.join(',') || 'ok'}`);
    }
  }
  process.exit(exitCodeFor(report, args.failOn));
}

module.exports = {
  inventoryEndpointPosture,
  scoreMcpServer,
  scoreSkill,
  bandFor,
  SOURCE,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(2);
  }
}
