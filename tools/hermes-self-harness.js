#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();

const DEFAULT_PATHS = {
  config: path.join(HOME, '.hermes/config.yaml'),
  agentLog: path.join(HOME, '.hermes/logs/agent.log'),
  errorsLog: path.join(HOME, '.hermes/logs/errors.log'),
  yoloWrapper: path.join(HOME, 'workspace/git/igor/mac-yolo-safeguards/hermes-yolo-wrapper.js'),
};

const PATTERNS = [
  {
    id: 'provider_credit_or_context_limit',
    severity: 'critical',
    surface: 'model_routing',
    match: (evidence) => /HTTP 402|Prompt tokens limit exceeded|requires more credits|can only afford/i.test(evidence.logs),
    proposal: 'Route routine CLI and hermes-yolo work to a local provider; reserve GLM/OpenRouter for explicit minimal high-reasoning calls.',
    gate: 'Run hermes-yolo smoke and a minimal GLM route smoke; both must return exact markers, and logs must show no new HTTP 402 for the smoke window.',
    configChecks: [
      ['model.provider', /provider:\s*custom:ollama-local-64k/],
      ['model.max_tokens', /max_tokens:\s*(1024|1536|2048)/],
    ],
  },
  {
    id: 'busy_input_interrupt_loop',
    severity: 'high',
    surface: 'display.busy_input_mode',
    match: (evidence) => /interrupted_during_api_call|Interrupted - processing new message|busy_input_mode:\s*interrupt/i.test(evidence.logsAndConfig),
    proposal: 'Set Hermes interactive busy input to queue so follow-up messages do not abort the active model call.',
    gate: 'Config parse shows display.busy_input_mode=queue and a CLI smoke is not interrupted while running.',
    configChecks: [['display.busy_input_mode', /busy_input_mode:\s*queue/]],
  },
  {
    id: 'prompt_tool_bloat',
    severity: 'high',
    surface: 'toolsets_and_mcp',
    match: (evidence) => /Tool schemas\s+:\s+\d|context7[\s\S]{0,80}enabled:\s*true|toolsets:[\s\S]{0,120}computer_use/i.test(evidence.logsAndConfig),
    proposal: 'Keep the default CLI toolset small and disable always-on MCP docs lookup; enable browser/computer-use/context7 only per task.',
    gate: 'hermes tools list shows only the slim CLI working set enabled by default and context7 disabled.',
    configChecks: [
      ['default toolsets', /toolsets:\s*\n-\s*terminal\s*\n-\s*file\s*\n-\s*web\s*\n-\s*code_execution\s*\n-\s*memory\s*\n-\s*clarify/],
      ['context7 disabled', /context7:\s*\n\s*enabled:\s*false/],
    ],
  },
  {
    id: 'placeholder_plan_drift',
    severity: 'medium',
    surface: 'agent.system_prompt',
    match: (evidence) => /YOUR_RETRIEVAL_ENDPOINT|your-retrieval-endpoint|placeholder steps|unexecuted pseudo-code|tone-police/i.test(evidence.logsAndConfig),
    proposal: 'Add a compact execution protocol: run/read evidence first, no fake endpoints, no tone policing, and keep approval gates only around consequential actions.',
    gate: 'Config parse confirms the compact protocol and a smoke response contains no fake endpoint/template plan.',
    configChecks: [['execution protocol', /never emit fake endpoints|tone-police|Queue busy input/i]],
  },
  {
    id: 'stale_yolo_lock_or_prefix_process',
    severity: 'medium',
    surface: 'hermes-yolo-wrapper',
    match: (evidence) => /Another hermes-yolo is already running|terminal,file,web,browser,code_execution,vision,computer_use,skills,todo,memory,context_engine,session_search,moa/i.test(evidence.logsAndConfig),
    proposal: 'Have the wrapper default to the slim local route and clear only verified stale locks/processes.',
    gate: 'hermes-yolo final smoke returns an exact cwd marker and /tmp/hermes-yolo.lock is absent or owned by the live wrapper.',
    configChecks: [
      ['wrapper slim toolsets', /DEFAULT_TOOLSETS.*terminal,file,web,code_execution,memory,clarify/],
      ['wrapper local provider', /DEFAULT_PROVIDER.*custom:ollama-local-64k/],
    ],
  },
  {
    id: 'gateway_completion_timeout',
    severity: 'medium',
    surface: 'api_server_runtime',
    match: (evidence) => /Operation timed out after 90006 milliseconds|idle for \d+s|waiting for stream response/i.test(evidence.logs),
    proposal: 'Treat gateway health and gateway completion as separate checks; keep CLI/yolo as the fast control path until API completion latency has its own fix.',
    gate: 'health/detailed is ok with active_agents=0, and a separate API completion smoke is tracked with timeout evidence.',
    configChecks: [],
  },
];

function parseArgs(argv) {
  const args = {
    json: false,
    markdown: false,
    failOnCritical: false,
    config: DEFAULT_PATHS.config,
    agentLog: DEFAULT_PATHS.agentLog,
    errorsLog: DEFAULT_PATHS.errorsLog,
    yoloWrapper: DEFAULT_PATHS.yoloWrapper,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--fail-on-critical') args.failOnCritical = true;
    else if (arg === '--config') args.config = requireValue(argv, ++i, arg);
    else if (arg === '--agent-log') args.agentLog = requireValue(argv, ++i, arg);
    else if (arg === '--errors-log') args.errorsLog = requireValue(argv, ++i, arg);
    else if (arg === '--yolo-wrapper') args.yoloWrapper = requireValue(argv, ++i, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readMaybe(filePath, maxBytes = 800000) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch (error) {
    return '';
  }
}

function collectEvidence(paths = DEFAULT_PATHS) {
  const resolvedPaths = {
    config: paths.config || DEFAULT_PATHS.config,
    agentLog: paths.agentLog || DEFAULT_PATHS.agentLog,
    errorsLog: paths.errorsLog || DEFAULT_PATHS.errorsLog,
    yoloWrapper: paths.yoloWrapper || DEFAULT_PATHS.yoloWrapper,
  };
  const config = readMaybe(resolvedPaths.config);
  const agentLog = readMaybe(resolvedPaths.agentLog);
  const errorsLog = readMaybe(resolvedPaths.errorsLog);
  const yoloWrapper = readMaybe(resolvedPaths.yoloWrapper);
  const logs = `${agentLog}\n${errorsLog}`;
  return {
    paths: resolvedPaths,
    config,
    agentLog,
    errorsLog,
    yoloWrapper,
    logs,
    logsAndConfig: `${logs}\n${config}\n${yoloWrapper}`,
  };
}

function extractEvidence(pattern, evidence) {
  const haystack = evidence.logsAndConfig;
  const snippets = [];
  const tokens = {
    provider_credit_or_context_limit: [/HTTP 402[^\n]*/gi, /Prompt tokens limit exceeded[^\n]*/gi, /requires more credits[^\n]*/gi],
    busy_input_interrupt_loop: [/interrupted_during_api_call[^\n]*/gi, /busy_input_mode:\s*\w+/gi],
    prompt_tool_bloat: [/Tool schemas\s+:[^\n]*/gi, /context7:[\s\S]{0,80}enabled:\s*\w+/gi, /toolsets:[\s\S]{0,160}/gi],
    placeholder_plan_drift: [/YOUR_RETRIEVAL_ENDPOINT[^\n]*/gi, /tone-police[^\n]*/gi, /never emit fake endpoints[^\n]*/gi],
    stale_yolo_lock_or_prefix_process: [/Another hermes-yolo is already running[^\n]*/gi, /DEFAULT_TOOLSETS[^\n]*/gi],
    gateway_completion_timeout: [/Operation timed out[^\n]*/gi, /idle for \d+s[^\n]*/gi, /waiting for stream response[^\n]*/gi],
  }[pattern.id] || [];
  for (const token of tokens) {
    for (const match of haystack.matchAll(token)) {
      snippets.push(match[0].replace(/\s+/g, ' ').trim());
      if (snippets.length >= 4) return snippets;
    }
  }
  return snippets;
}

function evaluateConfigChecks(pattern, evidence) {
  return pattern.configChecks.map(([name, regex]) => ({
    name,
    passed: regex.test(evidence.logsAndConfig),
  }));
}

function mineWeaknesses(evidence) {
  return PATTERNS
    .filter((pattern) => pattern.match(evidence))
    .map((pattern) => {
      const checks = evaluateConfigChecks(pattern, evidence);
      const configured = checks.length > 0 && checks.every((check) => check.passed);
      return {
        id: pattern.id,
        severity: pattern.severity,
        surface: pattern.surface,
        evidence: extractEvidence(pattern, evidence),
        proposal: pattern.proposal,
        promotionGate: pattern.gate,
        configChecks: checks,
        status: configured ? 'already_promoted_or_configured' : 'candidate',
      };
    });
}

function buildReport(options = {}) {
  const evidence = collectEvidence(options);
  const weaknesses = mineWeaknesses(evidence);
  const criticalOpen = weaknesses.filter((item) => item.severity === 'critical' && item.status === 'candidate');
  const summary = {
    checkedAt: new Date().toISOString(),
    source: 'self-harness-inspired deterministic Hermes trace/config miner',
    filesRead: Object.values(evidence.paths).filter(Boolean).length,
    weaknessesFound: weaknesses.length,
    candidateCount: weaknesses.filter((item) => item.status === 'candidate').length,
    alreadyConfiguredCount: weaknesses.filter((item) => item.status === 'already_promoted_or_configured').length,
    criticalOpenCount: criticalOpen.length,
    acceptanceRule: 'Promote only bounded harness edits with trace/config evidence and a named regression/smoke gate.',
  };
  return { summary, weaknesses };
}

function renderMarkdown(report) {
  const lines = [
    '# Hermes Self-Harness Report',
    '',
    `Checked: ${report.summary.checkedAt}`,
    `Weaknesses found: ${report.summary.weaknessesFound}`,
    `Candidates: ${report.summary.candidateCount}`,
    `Already configured: ${report.summary.alreadyConfiguredCount}`,
    `Open critical: ${report.summary.criticalOpenCount}`,
    '',
    '## Acceptance Rule',
    '',
    report.summary.acceptanceRule,
    '',
  ];
  for (const item of report.weaknesses) {
    lines.push(`## ${item.id}`, '');
    lines.push(`Severity: ${item.severity}`);
    lines.push(`Surface: ${item.surface}`);
    lines.push(`Status: ${item.status}`);
    lines.push(`Proposal: ${item.proposal}`);
    lines.push(`Gate: ${item.promotionGate}`);
    if (item.evidence.length) {
      lines.push('Evidence:');
      for (const snippet of item.evidence) lines.push(`- ${snippet}`);
    }
    if (item.configChecks.length) {
      lines.push('Config checks:');
      for (const check of item.configChecks) lines.push(`- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/hermes-self-harness.js [--json|--markdown] [--fail-on-critical]');
    return;
  }
  const report = buildReport(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderMarkdown(report));
  if (args.failOnCritical && report.summary.criticalOpenCount > 0) process.exitCode = 2;
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
  PATTERNS,
  buildReport,
  collectEvidence,
  mineWeaknesses,
  parseArgs,
  renderMarkdown,
};
