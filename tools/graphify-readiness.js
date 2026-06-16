#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');

const usage = `Usage:
  node tools/graphify-readiness.js [--repo path] [--json] [--out file]

Checks whether Graphify is available and prints the exact commands Hermes should
use to build/query a repo knowledge graph. This is a readiness/planning tool; it
does not install packages or send code anywhere.`;

function parseArgs(argv) {
  const args = {
    repo: process.cwd(),
    json: false,
    out: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = requireValue(argv, ++i, '--repo');
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  args.repo = path.resolve(args.repo);
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function commandPath(command) {
  const result = run('sh', ['-c', 'command -v "$1"', 'sh', command]);
  return result.status === 0 ? result.stdout.trim() : '';
}

function graphifyPathForRepo(repo) {
  const local = path.join(repo, '.graphify-venv', 'bin', 'graphify');
  if (fs.existsSync(local)) return local;
  return commandPath('graphify');
}

function pythonModulePresent(moduleName) {
  const result = run('python3', ['-c', `import ${moduleName}; print("ok")`]);
  return result.status === 0;
}

function countCandidateFiles(repo) {
  const exts = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.sh', '.md', '.json', '.yml', '.yaml', '.pdf', '.png', '.jpg', '.jpeg']);
  let count = 0;
  const stack = [repo];
  while (stack.length > 0 && count <= 20000) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.build' || entry.name === '.graphify-venv' || entry.name === 'coverage') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (exts.has(path.extname(entry.name).toLowerCase())) count += 1;
    }
  }
  return count;
}

function buildCommands(repo) {
  const outDir = path.join(repo, 'graphify-out');
  const venv = path.join(repo, '.graphify-venv');
  const graphifyBin = path.join(venv, 'bin', 'graphify');
  return {
    install: `python3 -m venv ${shellQuote(venv)} && ${shellQuote(path.join(venv, 'bin', 'python'))} -m pip install graphifyy && ${shellQuote(graphifyBin)} install`,
    build: `${shellQuote(graphifyBin)} ${shellQuote(repo)}`,
    query: `${shellQuote(graphifyBin)} query "Which files explain Hermes Telegram reliability and media ingestion?"`,
    path: `${shellQuote(graphifyBin)} path "tools/media-content-ingest.js" "hermes-skills/mac-yolo-safeguards/SKILL.md"`,
    outputs: [
      path.join(outDir, 'graph.html'),
      path.join(outDir, 'GRAPH_REPORT.md'),
      path.join(outDir, 'graph.json'),
    ],
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function collect(options = {}) {
  const repo = path.resolve(options.repo || process.cwd());
  const graphifyPath = graphifyPathForRepo(repo);
  const modulePresent = pythonModulePresent('graphify');
  const candidateFiles = fs.existsSync(repo) ? countCandidateFiles(repo) : 0;
  const commands = buildCommands(repo);
  const findings = [];
  if (!fs.existsSync(repo)) {
    findings.push({
      severity: 'high',
      title: 'Repository path does not exist',
      evidence: repo,
      recommendation: 'Point --repo at an existing checkout before building a knowledge graph.',
    });
  }
  if (!graphifyPath && !modulePresent) {
    findings.push({
      severity: 'medium',
      title: 'Graphify is not installed',
      evidence: 'No graphify CLI and no Python graphify module found.',
      recommendation: `${commands.install} (repo-local virtualenv; avoids Homebrew Python PEP 668 breakage)`,
    });
  }
  if (candidateFiles > 800) {
    findings.push({
      severity: 'low',
      title: 'Large graph candidate set',
      evidence: `${candidateFiles} candidate files before Graphify filtering.`,
      recommendation: 'Run Graphify on the repo, then query GRAPH_REPORT.md before asking an LLM to read broad file sets.',
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    repo,
    graphify: {
      cliPath: graphifyPath,
      pythonModulePresent: modulePresent,
      installed: Boolean(graphifyPath || modulePresent),
    },
    candidateFiles,
    commands,
    hermesPolicy: {
      rule: 'Use Graphify before broad repo questions, cross-file debugging, architecture summaries, or PDF/diagram-heavy research.',
      fallback: 'If Graphify is not installed, use ripgrep and targeted file reads; do not pretend a graph was built.',
    },
    findings,
  };
}

function writeReport(report, outFile) {
  const target = outFile || path.join(DEFAULT_OUT_DIR, 'graphify-readiness.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return target;
}

function render(report) {
  const lines = [
    '# Graphify Readiness',
    '',
    `Repo: ${report.repo}`,
    `Installed: ${report.graphify.installed ? 'yes' : 'no'}`,
    `CLI: ${report.graphify.cliPath || '<missing>'}`,
    `Candidate files: ${report.candidateFiles}`,
    '',
    '## Commands',
    '',
    `Install: \`${report.commands.install}\``,
    `Build: \`${report.commands.build}\``,
    `Query: \`${report.commands.query}\``,
    `Path: \`${report.commands.path}\``,
    '',
  ];
  if (report.findings.length > 0) {
    lines.push('## Findings', '');
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Next: ${finding.recommendation}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = collect(args);
  const out = args.out ? writeReport(report, args.out) : null;
  if (args.json) console.log(JSON.stringify({ ...report, outputPath: out }, null, 2));
  else {
    process.stdout.write(render(report));
    if (out) console.log(`Report: ${out}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  buildCommands,
  collect,
  countCandidateFiles,
  graphifyPathForRepo,
  parseArgs,
  render,
  shellQuote,
};
