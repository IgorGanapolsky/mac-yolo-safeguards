'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildPlan,
  maxTokensForEffort,
  normalizeEffort,
  openRouterReasoning,
  providerNativeMappings,
} = require('../tools/openrouter-reasoning-plan');
const {
  buildCommands,
  chooseOllamaModel,
  collect,
  countCandidateFiles,
  graphifyPathForRepo,
  MIN_GRAPHIFY_VERSION,
  parseArgs: parseGraphifyArgs,
  shellQuote,
  summarizeCandidateFiles,
  versionAtLeast,
} = require('../tools/graphify-readiness');

assert.strictEqual(normalizeEffort('HIGH'), 'high');
assert.throws(() => normalizeEffort('huge'), /Unsupported effort/);
assert.strictEqual(maxTokensForEffort('minimal'), 256);
assert.strictEqual(maxTokensForEffort('xhigh'), 6400);
assert.deepStrictEqual(openRouterReasoning('none'), { effort: 'none', enabled: false, exclude: false });
assert.deepStrictEqual(openRouterReasoning('high'), { effort: 'high', enabled: true, exclude: false });

const mappings = providerNativeMappings('medium');
assert.strictEqual(mappings.openai.reasoning.effort, 'medium');
assert.strictEqual(mappings.anthropic.thinking.budget_tokens, 1600);
assert.strictEqual(mappings.google.thinking.enabled, true);

const openRouterPlan = buildPlan({
  effort: 'high',
  model: 'openai/gpt-5.5',
  config: {
    model: { provider: 'openrouter', default: 'openai/gpt-5.5' },
    fallback_providers: [],
  },
});
assert.strictEqual(openRouterPlan.openRouterPayload.reasoning.effort, 'high');
assert.strictEqual(openRouterPlan.findings.length, 0);

const noOpenRouterPlan = buildPlan({
  effort: 'low',
  config: {
    model: { provider: 'nous', default: 'stepfun/step-3.7-flash:free' },
    fallback_providers: [],
  },
});
assert.ok(noOpenRouterPlan.findings.some((finding) => finding.title.includes('OpenRouter is not configured')));

assert.strictEqual(shellQuote("/tmp/igor's repo"), "'/tmp/igor'\\''s repo'");
const commands = buildCommands('/tmp/repo', { ollamaModel: 'qwen3:8b' });
assert.ok(commands.install.includes('graphifyy'));
assert.ok(commands.install.includes(`graphifyy==${MIN_GRAPHIFY_VERSION}`));
assert.ok(commands.install.includes('openai'));
assert.ok(commands.build.includes('--code-only'));
assert.ok(commands.build.includes('--no-cluster'));
assert.ok(commands.buildWithLocalOllama.includes('--backend ollama'));
assert.ok(commands.buildWithLocalOllama.includes('qwen3:8b'));
assert.ok(commands.outputs.some((output) => output.endsWith('GRAPH_REPORT.md')));
assert.strictEqual(parseGraphifyArgs(['--probe-local-llm']).probeLocalLlm, true);
assert.strictEqual(chooseOllamaModel(['qwen3:8b', 'qwen2.5:3b']), 'qwen3:8b');
assert.strictEqual(chooseOllamaModel(['qwen3:14b-32k', 'qwen3:8b']), 'qwen3:14b-32k');
assert.strictEqual(versionAtLeast('0.9.26', MIN_GRAPHIFY_VERSION), true);
assert.strictEqual(versionAtLeast('0.10.0', MIN_GRAPHIFY_VERSION), true);
assert.strictEqual(versionAtLeast('0.8.40', MIN_GRAPHIFY_VERSION), false);

const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-test-'));
fs.mkdirSync(path.join(tempRepo, 'src'));
fs.mkdirSync(path.join(tempRepo, '.graphify-venv', 'bin'), { recursive: true });
fs.writeFileSync(
  path.join(tempRepo, '.graphify-venv', 'bin', 'graphify'),
  '#!/bin/sh\necho "graphify 0.9.26"\n',
  { mode: 0o755 },
);
fs.writeFileSync(path.join(tempRepo, 'src', 'a.js'), 'console.log("a")\n');
fs.writeFileSync(path.join(tempRepo, 'README.md'), '# test\n');
fs.writeFileSync(path.join(tempRepo, 'diagram.png'), 'not a real png\n');
fs.mkdirSync(path.join(tempRepo, 'node_modules'));
fs.writeFileSync(path.join(tempRepo, 'node_modules', 'ignored.js'), 'ignored\n');
fs.mkdirSync(path.join(tempRepo, 'generated'));
fs.writeFileSync(path.join(tempRepo, 'generated', 'ignored.ts'), 'ignored\n');
fs.writeFileSync(path.join(tempRepo, '.gitignore'), 'node_modules/\ngenerated/\n');
execFileSync('git', ['init', '--quiet'], { cwd: tempRepo });
assert.strictEqual(countCandidateFiles(tempRepo), 3);
assert.deepStrictEqual(summarizeCandidateFiles(tempRepo), {
  total: 3,
  code: 1,
  docs: 1,
  images: 1,
  semantic: 2,
});
assert.strictEqual(graphifyPathForRepo(tempRepo), path.join(tempRepo, '.graphify-venv', 'bin', 'graphify'));
const graphReport = collect({ repo: tempRepo });
assert.strictEqual(graphReport.repo, tempRepo);
assert.strictEqual(graphReport.candidateFiles, 3);
assert.strictEqual(graphReport.graphify.installed, true);
assert.strictEqual(graphReport.graphify.version, '0.9.26');
assert.strictEqual(graphReport.graphify.versionSupported, true);
assert.strictEqual(graphReport.graphify.graphBuilt, false);
assert.ok(graphReport.findings.some((finding) => finding.title === 'Graphify graph is not built yet'));
fs.rmSync(tempRepo, { recursive: true, force: true });

console.log('OpenRouter and Graphify tool tests: PASS');
