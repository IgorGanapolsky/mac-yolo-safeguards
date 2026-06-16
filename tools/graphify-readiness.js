#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');

const usage = `Usage:
  node tools/graphify-readiness.js [--repo path] [--json] [--out file] [--probe-local-llm]

Checks whether Graphify is available and prints the exact commands Hermes should
use to build/query a repo knowledge graph. This is a readiness/planning tool; it
does not install packages or send code anywhere. With --probe-local-llm it sends
a tiny prompt to local Ollama only, to verify Graphify's OpenAI-compatible local
backend will not stall.`;

function parseArgs(argv) {
  const args = {
    repo: process.cwd(),
    json: false,
    out: '',
    help: false,
    probeLocalLlm: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = requireValue(argv, ++i, '--repo');
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg === '--json') args.json = true;
    else if (arg === '--probe-local-llm') args.probeLocalLlm = true;
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

function pythonPackagePresent(pythonBin, moduleName) {
  if (!fs.existsSync(pythonBin)) return false;
  const result = run(pythonBin, ['-c', `import ${moduleName}; print("ok")`]);
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

function summarizeCandidateFiles(repo) {
  const summary = {
    total: 0,
    code: 0,
    docs: 0,
    images: 0,
    semantic: 0,
  };
  const codeExts = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.sh']);
  const docExts = new Set(['.md', '.json', '.yml', '.yaml', '.pdf']);
  const imageExts = new Set(['.png', '.jpg', '.jpeg']);
  const stack = [repo];
  while (stack.length > 0 && summary.total <= 20000) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.build' || entry.name === '.graphify-venv' || entry.name === 'coverage' || entry.name === 'graphify-out') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (codeExts.has(ext)) {
        summary.total += 1;
        summary.code += 1;
      } else if (docExts.has(ext)) {
        summary.total += 1;
        summary.docs += 1;
        summary.semantic += 1;
      } else if (imageExts.has(ext)) {
        summary.total += 1;
        summary.images += 1;
        summary.semantic += 1;
      }
    }
  }
  return summary;
}

function presentEnvKeys() {
  return ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'MOONSHOT_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY']
    .filter((name) => Boolean(process.env[name]));
}

function ollamaModels() {
  if (!commandPath('ollama')) return [];
  const result = run('ollama', ['list'], { timeout: 10000 });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function chooseOllamaModel(models) {
  return models.find((model) => /^qwen3:14b/.test(model))
    || models.find((model) => /^qwen3:8b/.test(model))
    || models[0]
    || '';
}

function postJson(url, payload, timeoutSeconds) {
  const result = run('curl', [
    '-sS',
    '--max-time',
    String(timeoutSeconds),
    url,
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify(payload),
  ], { timeout: (timeoutSeconds + 2) * 1000 });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function probeOllama(model) {
  if (!model) return { checked: false, nativeOk: false, openAiCompatibleOk: false, evidence: 'No Ollama model available.' };
  const native = postJson('http://localhost:11434/api/generate', {
    model,
    prompt: 'Say ok only.',
    stream: false,
    options: { num_predict: 4 },
  }, 12);
  const openAiCompatible = postJson('http://localhost:11434/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: 'Say ok only.' }],
    max_tokens: 4,
    stream: false,
  }, 12);
  return {
    checked: true,
    model,
    nativeOk: native.ok && /"done"\s*:\s*true/.test(native.stdout),
    openAiCompatibleOk: openAiCompatible.ok && /"choices"\s*:/.test(openAiCompatible.stdout),
    evidence: {
      nativeStatus: native.status,
      nativeSnippet: native.stdout.slice(0, 160) || native.stderr.slice(0, 160),
      openAiCompatibleStatus: openAiCompatible.status,
      openAiCompatibleSnippet: openAiCompatible.stdout.slice(0, 160) || openAiCompatible.stderr.slice(0, 160),
    },
  };
}

function buildCommands(repo, options = {}) {
  const outDir = path.join(repo, 'graphify-out');
  const venv = path.join(repo, '.graphify-venv');
  const graphifyBin = path.join(venv, 'bin', 'graphify');
  const ollamaModel = options.ollamaModel || '<installed-ollama-model>';
  return {
    install: `python3 -m venv ${shellQuote(venv)} && ${shellQuote(path.join(venv, 'bin', 'python'))} -m pip install graphifyy openai && ${shellQuote(graphifyBin)} install`,
    build: `${shellQuote(graphifyBin)} ${shellQuote(repo)}`,
    buildWithLocalOllama: `${shellQuote(graphifyBin)} extract ${shellQuote(repo)} --backend ollama --model ${shellQuote(ollamaModel)} --max-concurrency 1 --out ${shellQuote(repo)}`,
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
  const candidateSummary = fs.existsSync(repo) ? summarizeCandidateFiles(repo) : { total: 0, code: 0, docs: 0, images: 0, semantic: 0 };
  const llmEnvKeys = presentEnvKeys();
  const localOllamaModels = ollamaModels();
  const preferredOllamaModel = chooseOllamaModel(localOllamaModels);
  const localLlmProbe = options.probeLocalLlm ? probeOllama(preferredOllamaModel) : { checked: false };
  const commands = buildCommands(repo, { ollamaModel: preferredOllamaModel || '<installed-ollama-model>' });
  const graphJson = path.join(repo, 'graphify-out', 'graph.json');
  const venvPython = path.join(repo, '.graphify-venv', 'bin', 'python');
  const ollamaPythonPackagePresent = pythonPackagePresent(venvPython, 'openai');
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
  if (candidateSummary.semantic > 0 && llmEnvKeys.length === 0) {
    findings.push({
      severity: localOllamaModels.length > 0 ? 'medium' : 'high',
      title: 'Default Graphify build needs a semantic backend',
      evidence: `${candidateSummary.semantic} doc/image file(s) need semantic extraction and no cloud LLM API key is present.`,
      recommendation: localOllamaModels.length > 0 && (!localLlmProbe.checked || localLlmProbe.openAiCompatibleOk)
        ? `Use local Ollama explicitly: ${commands.buildWithLocalOllama}`
        : 'Set a Graphify-supported API key, repair Ollama OpenAI-compatible /v1 responses, or reduce the corpus to code-only files before full extraction.',
    });
  }
  if (candidateSummary.semantic > 0 && localLlmProbe.checked && !localLlmProbe.openAiCompatibleOk) {
    findings.push({
      severity: 'high',
      title: 'Local Ollama OpenAI-compatible endpoint is not healthy',
      evidence: `Native Ollama API ok=${localLlmProbe.nativeOk}; /v1 chat ok=${localLlmProbe.openAiCompatibleOk}. Graphify's Ollama backend uses /v1.`,
      recommendation: 'Do not launch local Graphify semantic extraction until /v1/chat/completions returns quickly, or use a cloud LLM API key for Graphify.',
    });
  }
  if (candidateSummary.semantic > 0 && localOllamaModels.length > 0 && !ollamaPythonPackagePresent) {
    findings.push({
      severity: 'medium',
      title: 'Local Ollama Graphify backend dependency is missing',
      evidence: `${venvPython} cannot import the Python openai package required by Graphify's Ollama backend.`,
      recommendation: `${shellQuote(venvPython)} -m pip install openai`,
    });
  }
  if (!fs.existsSync(graphJson)) {
    findings.push({
      severity: 'medium',
      title: 'Graphify graph is not built yet',
      evidence: `${graphJson} is missing.`,
      recommendation: candidateSummary.semantic > 0 && llmEnvKeys.length === 0 && localOllamaModels.length > 0 && (!localLlmProbe.checked || localLlmProbe.openAiCompatibleOk) ? commands.buildWithLocalOllama : commands.build,
    });
  }
  if (candidateSummary.total > 800) {
    findings.push({
      severity: 'low',
      title: 'Large graph candidate set',
      evidence: `${candidateSummary.total} candidate files before Graphify filtering.`,
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
      graphJson,
      graphBuilt: fs.existsSync(graphJson),
    },
    candidateFiles: candidateSummary.total,
    candidateSummary,
    semanticBackends: {
      envKeysPresent: llmEnvKeys,
      ollamaModels: localOllamaModels,
      preferredOllamaModel,
      ollamaPythonPackagePresent,
      localLlmProbe,
    },
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
    `Graph built: ${report.graphify.graphBuilt ? 'yes' : 'no'}`,
    `Candidate files: ${report.candidateFiles}`,
    `Semantic files: ${report.candidateSummary.semantic}`,
    `Cloud LLM keys present: ${report.semanticBackends.envKeysPresent.length > 0 ? report.semanticBackends.envKeysPresent.join(', ') : 'none'}`,
    `Ollama models: ${report.semanticBackends.ollamaModels.length > 0 ? report.semanticBackends.ollamaModels.join(', ') : 'none'}`,
    `Ollama Python dependency: ${report.semanticBackends.ollamaPythonPackagePresent ? 'present' : 'missing'}`,
    `Ollama /v1 probe: ${report.semanticBackends.localLlmProbe.checked ? (report.semanticBackends.localLlmProbe.openAiCompatibleOk ? 'pass' : 'fail') : 'not checked'}`,
    '',
    '## Commands',
    '',
    `Install: \`${report.commands.install}\``,
    `Build: \`${report.commands.build}\``,
    `Build with local Ollama: \`${report.commands.buildWithLocalOllama}\``,
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
  summarizeCandidateFiles,
  graphifyPathForRepo,
  chooseOllamaModel,
  pythonPackagePresent,
  probeOllama,
  parseArgs,
  render,
  shellQuote,
};
