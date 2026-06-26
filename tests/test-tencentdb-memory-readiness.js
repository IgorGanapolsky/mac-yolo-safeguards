'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CONTROLS,
  buildPlan,
  collect,
  parseArgs,
  render,
} = require('../tools/tencentdb-memory-readiness');

assert.ok(CONTROLS.some((control) => control.key === 'short_term_refs'));
assert.ok(CONTROLS.some((control) => control.key === 'layered_ltm'));
assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--fail-on-low']).failOnLow, true);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

const weakPlan = buildPlan({
  evidence: {
    memoryCharLimit: null,
    hermesMemoryEnabled: false,
    boundedPromptMemory: false,
    slimMemoryToolset: false,
    hasSelfHarness: false,
    hasTokenBloatSignals: true,
    hasInterruptSignals: true,
    hasRefsDir: false,
    refsHaveFiles: false,
    hasScenarioDir: false,
    scenariosHaveFiles: false,
    hasConversationDir: false,
    hasAtomsFile: false,
    hasPersonaFile: false,
    hasCanvasFile: false,
    canvasHasMermaid: false,
    atomsHaveTrace: false,
    hasTencentRoute: false,
    hasTencentRepoEvidence: true,
    ciCoversReadiness: false,
  },
});
assert.ok(weakPlan.readiness < 30);
assert.ok(weakPlan.recommendation.includes('Do not wire TencentDB Agent Memory'));
assert.ok(weakPlan.blockers.some((blocker) => blocker.includes('provider/plugin route')));
assert.ok(weakPlan.blockers.some((blocker) => blocker.includes('token/context/gateway-timeout')));
assert.ok(render(weakPlan).includes('TencentDB Agent Memory Readiness'));

const strongPlan = buildPlan({
  evidence: {
    memoryCharLimit: 4000,
    hermesMemoryEnabled: true,
    boundedPromptMemory: true,
    slimMemoryToolset: true,
    hasSelfHarness: true,
    hasTokenBloatSignals: false,
    hasInterruptSignals: false,
    hasRefsDir: true,
    refsHaveFiles: true,
    hasScenarioDir: true,
    scenariosHaveFiles: true,
    hasConversationDir: true,
    hasAtomsFile: true,
    hasPersonaFile: true,
    hasCanvasFile: true,
    canvasHasMermaid: true,
    atomsHaveTrace: true,
    hasTencentRoute: true,
    hasTencentRepoEvidence: true,
    ciCoversReadiness: true,
  },
});
assert.strictEqual(strongPlan.readiness, 100);
assert.ok(strongPlan.recommendation.includes('ready for an isolated'));
assert.ok(strongPlan.controls.every((control) => control.pass));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tencentdb-memory-readiness-'));
const repo = path.join(tmp, 'repo');
const memoryRoot = path.join(tmp, 'memory');
fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(memoryRoot, 'refs'), { recursive: true });
fs.mkdirSync(path.join(memoryRoot, 'scenarios'), { recursive: true });
fs.mkdirSync(path.join(memoryRoot, 'conversation'), { recursive: true });

fs.writeFileSync(path.join(repo, 'hermes-yolo-wrapper.js'), "const DEFAULT_TOOLSETS = 'terminal,file,web,code_execution,memory,clarify';");
fs.writeFileSync(path.join(repo, 'tools', 'hermes-self-harness.js'), 'Hermes Self-Harness criticalOpenCount');
fs.writeFileSync(path.join(repo, 'tools', 'tencentdb-memory-readiness.js'), 'TencentDB tdai_memory_search');
fs.writeFileSync(path.join(repo, 'scripts', 'ci-verify.sh'), 'node tests/test-tencentdb-memory-readiness.js');
fs.writeFileSync(path.join(memoryRoot, 'refs', 'run-001.md'), '# Raw tool output\n');
fs.writeFileSync(path.join(memoryRoot, 'scenarios', 'money-loop.md'), '# Scenario\n');
fs.writeFileSync(path.join(memoryRoot, 'conversation', 'l0.jsonl'), '{}\n');
fs.writeFileSync(path.join(memoryRoot, 'persona.md'), '# Persona\n');
fs.writeFileSync(path.join(memoryRoot, 'atoms.jsonl'), '{"node_id":"n1","result_ref":"refs/run-001.md"}\n');
fs.writeFileSync(path.join(memoryRoot, 'canvas.mmd'), 'flowchart TD\n  n1[Observe] --> n2[Act]\n');

const config = path.join(tmp, 'config.yaml');
const agentLog = path.join(tmp, 'agent.log');
const errorsLog = path.join(tmp, 'errors.log');
fs.writeFileSync(config, [
  'memory:',
  '  memory_enabled: true',
  '  memory_char_limit: 4000',
  '  provider: memory_tencentdb',
  '  tools:',
  '    - tdai_memory_search',
  '    - tdai_conversation_search',
  '',
].join('\n'));
fs.writeFileSync(agentLog, 'normal run\n');
fs.writeFileSync(errorsLog, '');

const evidence = collect({ repo, hermesConfig: config, agentLog, errorsLog, memoryRoot });
assert.strictEqual(evidence.hermesMemoryEnabled, true);
assert.strictEqual(evidence.boundedPromptMemory, true);
assert.strictEqual(evidence.refsHaveFiles, true);
assert.strictEqual(evidence.canvasHasMermaid, true);
assert.strictEqual(evidence.atomsHaveTrace, true);
assert.strictEqual(evidence.hasTencentRoute, true);
assert.strictEqual(evidence.ciCoversReadiness, true);

fs.rmSync(tmp, { recursive: true, force: true });

console.log('TencentDB memory readiness tests: PASS');
