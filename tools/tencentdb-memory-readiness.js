#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');
const DEFAULT_HERMES_CONFIG = path.join(os.homedir(), '.hermes/config.yaml');
const DEFAULT_AGENT_LOG = path.join(os.homedir(), '.hermes/logs/agent.log');
const DEFAULT_ERRORS_LOG = path.join(os.homedir(), '.hermes/logs/errors.log');
const DEFAULT_MEMORY_ROOT = path.join(os.homedir(), '.hermes/memory/tencentdb');

const CONTROLS = [
  {
    key: 'hermes_memory_enabled',
    weight: 12,
    title: 'Hermes memory is enabled',
    why: 'TencentDB-style memory only helps if Hermes is allowed to recall compact memory instead of stuffing raw history into the prompt.',
  },
  {
    key: 'bounded_prompt_memory',
    weight: 10,
    title: 'Prompt memory is bounded',
    why: 'A small prompt memory budget forces long logs into local references and keeps cheap models responsive.',
  },
  {
    key: 'short_term_refs',
    weight: 16,
    title: 'Short-term tool logs are offloaded to refs',
    why: 'Verbose browser, CLI, and tool outputs should live in local evidence files with result references.',
  },
  {
    key: 'mermaid_canvas',
    weight: 14,
    title: 'Compact task canvas exists',
    why: 'A Mermaid task canvas keeps the active state machine visible without replaying every raw event.',
  },
  {
    key: 'layered_ltm',
    weight: 16,
    title: 'Layered long-term memory exists',
    why: 'L0-L3 memory separates raw conversation, atomic facts, scenarios, and persona so recall stays precise.',
  },
  {
    key: 'traceable_recall',
    weight: 12,
    title: 'Recall is traceable to evidence',
    why: 'Every recalled memory needs a node_id or result_ref back to a raw local source.',
  },
  {
    key: 'hermes_plugin_route',
    weight: 10,
    title: 'TencentDB/Hermes provider route is configured',
    why: 'Hermes needs an explicit provider/plugin route before this becomes runtime behavior.',
  },
  {
    key: 'ci_guard',
    weight: 10,
    title: 'Readiness is covered by CI',
    why: 'Memory regressions should be caught before Hermes returns to token-burning behavior.',
  },
];

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    hermesConfig: DEFAULT_HERMES_CONFIG,
    agentLog: DEFAULT_AGENT_LOG,
    errorsLog: DEFAULT_ERRORS_LOG,
    memoryRoot: DEFAULT_MEMORY_ROOT,
    json: false,
    failOnLow: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--hermes-config') args.hermesConfig = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--agent-log') args.agentLog = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--errors-log') args.errorsLog = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--memory-root') args.memoryRoot = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--fail-on-low') args.failOnLow = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readText(filePath, maxBytes = 750000) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch (_) {
    return '';
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function dirHasFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).length > 0;
  } catch (_) {
    return false;
  }
}

function parseMemoryCharLimit(configText) {
  const match = configText.match(/memory_char_limit:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function collect(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const hermesConfigPath = options.hermesConfig || DEFAULT_HERMES_CONFIG;
  const agentLogPath = options.agentLog || DEFAULT_AGENT_LOG;
  const errorsLogPath = options.errorsLog || DEFAULT_ERRORS_LOG;
  const memoryRoot = path.resolve(options.memoryRoot || DEFAULT_MEMORY_ROOT);

  const hermesConfig = readText(hermesConfigPath);
  const agentLog = readText(agentLogPath);
  const errorsLog = readText(errorsLogPath);
  const combinedLogs = `${agentLog}\n${errorsLog}`;
  const yoloWrapper = readText(path.join(repo, 'hermes-yolo-wrapper.js'));
  const selfHarness = readText(path.join(repo, 'tools/hermes-self-harness.js'));
  const ci = readText(path.join(repo, 'scripts/ci-verify.sh'));
  const thisTool = readText(path.join(repo, 'tools/tencentdb-memory-readiness.js'));

  const refsDir = path.join(memoryRoot, 'refs');
  const scenariosDir = path.join(memoryRoot, 'scenarios');
  const conversationDir = path.join(memoryRoot, 'conversation');
  const atomsFile = path.join(memoryRoot, 'atoms.jsonl');
  const personaFile = path.join(memoryRoot, 'persona.md');
  const canvasFile = path.join(memoryRoot, 'canvas.mmd');

  const memoryCharLimit = parseMemoryCharLimit(hermesConfig);
  const hasTencentRoute = /memory_tencentdb|tencentdb|tdai_memory_search|tdai_conversation_search/i.test(hermesConfig);
  const hasTencentRepoEvidence = /memory_tencentdb|TencentDB|tdai_memory_search|tdai_conversation_search/i.test(thisTool);

  return {
    repo,
    hermesConfigPath,
    agentLogPath,
    errorsLogPath,
    memoryRoot,
    memoryCharLimit,
    hermesMemoryEnabled: /memory_enabled:\s*true/.test(hermesConfig),
    boundedPromptMemory: Number.isFinite(memoryCharLimit) && memoryCharLimit > 0 && memoryCharLimit <= 8000,
    slimMemoryToolset: /terminal,file,web,code_execution,memory,clarify/.test(yoloWrapper) || /-\s*memory\b/.test(hermesConfig),
    hasSelfHarness: /Hermes Self-Harness|criticalOpenCount|self-harness/i.test(selfHarness),
    hasTokenBloatSignals: /Prompt tokens limit exceeded|context.*limit|token.*limit|Tool schemas|waiting for stream response|gateway completion timeout|idle for \d+s/i.test(combinedLogs),
    hasInterruptSignals: /Interrupted during API call|processing new message/i.test(combinedLogs),
    hasRefsDir: fileExists(refsDir),
    refsHaveFiles: dirHasFiles(refsDir),
    hasScenarioDir: fileExists(scenariosDir),
    scenariosHaveFiles: dirHasFiles(scenariosDir),
    hasConversationDir: fileExists(conversationDir),
    hasAtomsFile: fileExists(atomsFile),
    hasPersonaFile: fileExists(personaFile),
    hasCanvasFile: fileExists(canvasFile),
    canvasHasMermaid: /graph\s+(TD|LR|RL|BT)|flowchart\s+(TD|LR|RL|BT)|stateDiagram|sequenceDiagram/.test(readText(canvasFile, 120000)),
    atomsHaveTrace: /node_id|result_ref|source_ref|trace_id/.test(readText(atomsFile, 120000)),
    hasTencentRoute,
    hasTencentRepoEvidence,
    ciCoversReadiness: /test-tencentdb-memory-readiness|tencentdb-memory-readiness/.test(ci),
  };
}

function controlStatus(control, evidence) {
  const passes = {
    hermes_memory_enabled: evidence.hermesMemoryEnabled && evidence.slimMemoryToolset,
    bounded_prompt_memory: evidence.boundedPromptMemory,
    short_term_refs: evidence.hasRefsDir && evidence.refsHaveFiles,
    mermaid_canvas: evidence.hasCanvasFile && evidence.canvasHasMermaid,
    layered_ltm: evidence.hasConversationDir && evidence.hasAtomsFile && evidence.hasScenarioDir && evidence.hasPersonaFile,
    traceable_recall: evidence.atomsHaveTrace || (evidence.refsHaveFiles && evidence.hasCanvasFile),
    hermes_plugin_route: evidence.hasTencentRoute,
    ci_guard: evidence.ciCoversReadiness,
  }[control.key];

  return {
    ...control,
    pass: Boolean(passes),
    status: passes ? 'OK' : 'GAP',
  };
}

function buildPlan(options = {}) {
  const evidence = options.evidence || collect(options);
  const controls = CONTROLS.map((control) => controlStatus(control, evidence));
  const maxScore = CONTROLS.reduce((sum, control) => sum + control.weight, 0);
  const passedScore = controls.reduce((sum, control) => sum + (control.pass ? control.weight : 0), 0);
  const readiness = Math.round((passedScore / maxScore) * 100);

  const blockers = [];
  if (!evidence.hermesMemoryEnabled) blockers.push('Hermes memory is not enabled in the active config.');
  if (!evidence.boundedPromptMemory) blockers.push('Hermes memory prompt budget is missing or too large.');
  if (!evidence.hasRefsDir || !evidence.refsHaveFiles) blockers.push('No populated local refs directory for offloaded tool evidence.');
  if (!evidence.hasCanvasFile || !evidence.canvasHasMermaid) blockers.push('No compact Mermaid task canvas is available for active task state.');
  if (!evidence.hasTencentRoute) blockers.push('TencentDB Agent Memory provider/plugin route is not configured yet.');
  if (evidence.hasTokenBloatSignals) blockers.push('Current logs still show token/context/gateway-timeout pressure.');
  if (evidence.hasInterruptSignals) blockers.push('Current logs still show interrupted CLI runs, so runtime stability should be proven before migration.');

  const recommendation = readiness >= 80
    ? 'Hermes is ready for an isolated TencentDB Agent Memory runtime proof.'
    : readiness >= 50
      ? 'Add local refs/canvas/layered-memory evidence before installing TencentDB Agent Memory into the live Hermes runtime.'
      : 'Do not wire TencentDB Agent Memory into live Hermes yet; first stop prompt bloat with local offload gates and traceable memory artifacts.';

  return {
    checkedAt: new Date().toISOString(),
    source: 'TencentDB Agent Memory local layered-memory architecture',
    readiness,
    recommendation,
    evidence,
    controls,
    blockers,
    nextActions: [
      'Keep raw browser, CLI, and tool logs out of Hermes prompts; store them under local refs with stable result_ref names.',
      'Maintain a small Mermaid task canvas in prompt that links to refs instead of replaying full history.',
      'Distill long-term memory into L0 conversation, L1 atoms, L2 scenarios, and L3 persona files before retrieval.',
      'Require node_id/result_ref traceability for every recalled lesson used in a revenue or deployment decision.',
      'Only after this readiness score is healthy, test the TencentDB/Hermes plugin or Docker route in an isolated runtime.',
    ],
  };
}

function render(plan) {
  const lines = [
    '# TencentDB Agent Memory Readiness',
    '',
    `Readiness: ${plan.readiness}/100`,
    `Recommendation: ${plan.recommendation}`,
    '',
    '## Controls',
    '',
  ];

  for (const control of plan.controls) {
    lines.push(`- ${control.status} ${control.title} (${control.weight})`);
    lines.push(`  Why: ${control.why}`);
  }

  if (plan.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }

  lines.push('', '## Next Actions', '');
  for (const action of plan.nextActions) lines.push(`- ${action}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/tencentdb-memory-readiness.js [--json] [--fail-on-low]');
    return;
  }

  const plan = buildPlan(args);
  if (args.json) console.log(JSON.stringify(plan, null, 2));
  else process.stdout.write(render(plan));
  if (args.failOnLow && plan.readiness < 70) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  CONTROLS,
  buildPlan,
  collect,
  parseArgs,
  render,
};
