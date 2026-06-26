'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReport,
  mineWeaknesses,
  parseArgs,
  renderMarkdown,
} = require('../tools/hermes-self-harness');

assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--markdown', '--fail-on-critical']).failOnCritical, true);
assert.throws(() => parseArgs(['--missing']), /Unknown argument/);

const failingEvidence = {
  paths: {},
  config: [
    'model:',
    '  provider: openrouter',
    '  max_tokens: 4096',
    'display:',
    '  busy_input_mode: interrupt',
    'mcp_servers:',
    '  context7:',
    '    enabled: true',
    'toolsets:',
    '- hermes-cli',
  ].join('\n'),
  agentLog: 'Turn ended: reason=interrupted_during_api_call model=qwen2.5:3b-64k',
  errorsLog: [
    'HTTP 402: Prompt tokens limit exceeded: 13535 > 9237.',
    'Operation timed out after 90006 milliseconds with 0 bytes received',
    'Another hermes-yolo is already running (PID 48698, state: S+).',
  ].join('\n'),
  yoloWrapper: "const DEFAULT_TOOLSETS = 'terminal,file,web,browser,code_execution,vision,computer_use,skills,todo,memory,context_engine,session_search,moa';",
};
failingEvidence.logs = `${failingEvidence.agentLog}\n${failingEvidence.errorsLog}`;
failingEvidence.logsAndConfig = `${failingEvidence.logs}\n${failingEvidence.config}\n${failingEvidence.yoloWrapper}`;

const weaknesses = mineWeaknesses(failingEvidence);
const ids = weaknesses.map((item) => item.id);
assert.ok(ids.includes('provider_credit_or_context_limit'));
assert.ok(ids.includes('busy_input_interrupt_loop'));
assert.ok(ids.includes('prompt_tool_bloat'));
assert.ok(ids.includes('stale_yolo_lock_or_prefix_process'));
assert.ok(ids.includes('gateway_completion_timeout'));
assert.strictEqual(weaknesses.find((item) => item.id === 'provider_credit_or_context_limit').status, 'candidate');

const configuredEvidence = {
  paths: {},
  config: [
    'model:',
    '  provider: custom:ollama-local-64k',
    '  max_tokens: 2048',
    'display:',
    '  busy_input_mode: queue',
    'mcp_servers:',
    '  context7:',
    '    enabled: false',
    'toolsets:',
    '- terminal',
    '- file',
    '- web',
    '- code_execution',
    '- memory',
    '- clarify',
    'agent:',
    '  system_prompt: "never emit fake endpoints and do not tone-police"',
  ].join('\n'),
  agentLog: 'Tool schemas         :   51,338 B  (50.1 KB, 21 tools)',
  errorsLog: 'HTTP 402: requires more credits',
  yoloWrapper: [
    "const DEFAULT_TOOLSETS = process.env.HERMES_YOLO_TOOLSETS || 'terminal,file,web,code_execution,memory,clarify';",
    "const DEFAULT_PROVIDER = process.env.HERMES_YOLO_PROVIDER || (HAS_ZAI_KEY ? 'custom:zai-coding-glm' : 'custom:ollama-local-64k');",
  ].join('\n'),
};
configuredEvidence.logs = `${configuredEvidence.agentLog}\n${configuredEvidence.errorsLog}`;
configuredEvidence.logsAndConfig = `${configuredEvidence.logs}\n${configuredEvidence.config}\n${configuredEvidence.yoloWrapper}`;

const configured = mineWeaknesses(configuredEvidence);
assert.strictEqual(configured.find((item) => item.id === 'provider_credit_or_context_limit').status, 'already_promoted_or_configured');
assert.strictEqual(configured.find((item) => item.id === 'prompt_tool_bloat').status, 'already_promoted_or_configured');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-self-harness-'));
const config = path.join(tmp, 'config.yaml');
const agentLog = path.join(tmp, 'agent.log');
const errorsLog = path.join(tmp, 'errors.log');
const yoloWrapper = path.join(tmp, 'hermes-yolo-wrapper.js');
fs.writeFileSync(config, configuredEvidence.config);
fs.writeFileSync(agentLog, configuredEvidence.agentLog);
fs.writeFileSync(errorsLog, configuredEvidence.errorsLog);
fs.writeFileSync(yoloWrapper, configuredEvidence.yoloWrapper);

const report = buildReport({ config, agentLog, errorsLog, yoloWrapper });
assert.strictEqual(report.summary.filesRead, 4);
assert.ok(report.summary.weaknessesFound >= 1);
assert.ok(report.summary.alreadyConfiguredCount >= 1);
assert.ok(renderMarkdown(report).includes('Hermes Self-Harness Report'));
assert.ok(renderMarkdown(report).includes('Acceptance Rule'));

console.log('Hermes self-harness tests: PASS');
