#!/usr/bin/env node
/**
 * jcode-fleet-ram-auditor.js
 * High-ROI jcode steal: Fleet RAM Auditor & Leak Detection.
 *
 * jcode's core claim is "most RAM efficient harness" backed by per-session
 * memory tables (PSS, marginal MB/session). This auditor applies that same
 * benchmarking rigor to OUR agent fleet: classify every running process into
 * agent-classes (hermes, agy, codex, snowflake-mcp, node-tools, infra),
 * report per-class RSS totals, and flag leak candidates (long-lived,
 * high-RSS, idle-class processes like orphaned MCP servers).
 *
 * Usage:
 *   node tools/jcode-fleet-ram-auditor.js            # full audit, exit 2 on leaks
 *   node tools/jcode-fleet-ram-auditor.js --report-only  # never fail CI
 *   node tools/jcode-fleet-ram-auditor.js --json     # machine-readable
 */

const { execFileSync } = require('child_process');

const CLASS_PATTERNS = [
  {
    name: 'agy',
    label: 'Agents (agy)',
    re: /agy\b/,
    leakable: true,
    leakNote: 'Long-lived agy sessions should be one-per-task; >1 old session = leak',
  },
  {
    name: 'snowflake-mcp',
    label: 'Snowflake MCP servers',
    re: /snowflake-labs-mcp/,
    leakable: true,
    leakNote: 'Each tool call may spawn an MCP server; servers should exit after idle',
  },
  {
    name: 'hermes-yolo',
    label: 'Hermes yolo wrappers',
    re: /hermes-yolo/,
    leakable: true,
    leakNote: 'Launcher+python pair; old pairs indicate dead agent shells not reaped',
  },
  {
    name: 'hermes-gateway',
    label: 'Hermes gateway',
    re: /hermes_cli\.main gateway run/,
    leakable: false,
  },
  {
    name: 'thumbgate',
    label: 'ThumbGate daemons',
    re: /ThumbGate/,
    leakable: true,
    leakNote: 'ThumbGate should run once; multiple daemons = zombie nodes',
  },
  {
    name: 'codex',
    label: 'Codex app-server',
    re: /codex\b|Codex Framework/,
    leakable: false,
  },
  {
    name: 'node-tools',
    label: 'Node tool daemons',
    re: /node .*mac-yolo-safeguards|node tools\//,
    leakable: false,
  },
  {
    name: 'actions-runner',
    label: 'GitHub actions runners',
    re: /actions-runner/,
    leakable: false,
  },
];

const IDLE_AGE_SEC = 6 * 60 * 60; // 6h without being reaped = suspicious
const LEAK_RSS_MB = 60;

function parseEtime(etime) {
  // etime formats: "MM:SS", "HH:MM:SS", "D-HH:MM:SS"
  const d = etime.split('-');
  const days = d.length > 1 ? parseInt(d[0], 10) : 0;
  const t = (d.length > 1 ? d[1] : d[0]).split(':').map(Number);
  let hours = 0;
  let mins = 0;
  let secs = 0;
  if (t.length === 3) [hours, mins, secs] = t;
  else if (t.length === 2) [mins, secs] = t;
  return ((days * 24 + hours) * 60 + mins) * 60 + secs;
}

function collectProcesses() {
  // macOS ps: etime is "D-HH:MM:SS" or "HH:MM:SS"; RSS in KB
  const out = execFileSync('ps', ['-axo', 'pid=,etime=,rss=,args='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
      if (!m) return null;
      return {
        pid: parseInt(m[1], 10),
        etime: m[2],
        ageSec: parseEtime(m[2]),
        rssMb: Math.round(parseInt(m[3], 10) / 1024),
        cmd: m[4],
      };
    })
    .filter(Boolean);
}

function classify(proc) {
  for (const cls of CLASS_PATTERNS) {
    if (cls.re.test(proc.cmd)) return cls;
  }
  return { name: 'other', label: 'Other', leakable: false };
}

function audit({ processes }) {
  const procs = processes || collectProcesses();
  const classes = new Map();
  const leaks = [];

  for (const p of procs) {
    const cls = classify(p);
    if (!classes.has(cls.name)) {
      classes.set(cls.name, { name: cls.name, label: cls.label, leakable: cls.leakable, leakNote: cls.leakNote, count: 0, rssMb: 0, procs: [] });
    }
    const c = classes.get(cls.name);
    c.count += 1;
    c.rssMb += p.rssMb;
    c.procs.push(p);
    if (cls.leakable && p.ageSec > IDLE_AGE_SEC && p.rssMb > LEAK_RSS_MB) {
      leaks.push({ pid: p.pid, ageSec: p.ageSec, rssMb: p.rssMb, cmd: p.cmd.slice(0, 100), className: cls.name });
    }
  }

  const totals = [...classes.values()]
    .map((c) => ({ key: c.name, name: c.label, count: c.count, rssMb: c.rssMb, leakable: c.leakable, leakNote: c.leakNote }))
    .sort((a, b) => b.rssMb - a.rssMb);
  const totalRss = totals.reduce((s, c) => s + c.rssMb, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalRssMb: totalRss,
    classes: totals.filter((c) => c.count > 0),
    leaks,
    summary: buildSummary(totals, totalRss, leaks.length),
  };
}

function buildSummary(totals, totalRss, leakCount) {
  const lines = [];
  lines.push('=== Fleet RAM Audit ===');
  lines.push(`${'-'.repeat(64)}`);
  for (const c of totals.filter((x) => x.count > 0)) {
    const leak = c.leakable ? ' (leak-suspect class)' : '';
    lines.push(`${c.name.padEnd(28)} ${String(c.count).padStart(5)} procs  ${String(c.rssMb).padStart(6)} MB${leak}`);
  }
  lines.push(`${'-'.repeat(64)}`);
  lines.push(`TOTAL RSS: ${totalRss} MB`);
  lines.push(`Leak candidates (class + age>6h + rss>60MB): ${leakCount}`);
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const result = audit({});
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
    for (const l of result.leaks) {
      console.log(`  LEAK pid=${l.pid} age=${Math.round(l.ageSec / 3600)}h rss=${l.rssMb}MB [${l.className}] ${l.cmd}`);
    }
  }
  if (result.leaks.length > 0 && !args.includes('--report-only')) {
    process.exitCode = 2;
  }
}

module.exports = { audit, classify, collectProcesses, parseEtime, CLASS_PATTERNS };