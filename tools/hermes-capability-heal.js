#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REQUIRED_WRAPPER_CAPABILITIES = ['skills', 'context7'];

function hardenedWrapperBlock(defaultToolsets) {
  return [
    "const REQUIRED_TOOLSETS = Object.freeze(['skills', 'context7']);",
    '',
    'function normalizeToolsets(value) {',
    "  const configured = String(value || '')",
    "    .split(',')",
    '    .map((item) => item.trim())',
    '    .filter(Boolean);',
    "  return [...new Set([...configured, ...REQUIRED_TOOLSETS])].join(',');",
    '}',
    '',
    'const DEFAULT_TOOLSETS = normalizeToolsets(',
    `  process.env.HERMES_YOLO_TOOLSETS || '${defaultToolsets}',`,
    ');',
  ].join('\n');
}

function clean(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function run(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: result.status === null ? 124 : result.status,
    stdout: clean(result.stdout),
    stderr: clean(result.stderr),
    error: result.error ? result.error.message : null,
  };
}

function ensureWrapperCapabilities(filePath, shouldRepair = false) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      healthy: false,
      changed: false,
      missing: [...REQUIRED_WRAPPER_CAPABILITIES],
      error: error.message,
    };
  }
  const hardenedMatch = text.match(/const REQUIRED_TOOLSETS = Object\.freeze\(\[([^\]]+)\]\);/);
  const hasNormalizer = /function normalizeToolsets\(value\)/.test(text)
    && /const DEFAULT_TOOLSETS = normalizeToolsets\(/.test(text);
  if (hardenedMatch && hasNormalizer) {
    const required = hardenedMatch[1]
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    const missing = REQUIRED_WRAPPER_CAPABILITIES.filter((item) => !required.includes(item));
    if (missing.length && shouldRepair) {
      const replacement = `const REQUIRED_TOOLSETS = Object.freeze([${REQUIRED_WRAPPER_CAPABILITIES.map((item) => `'${item}'`).join(', ')}]);`;
      fs.writeFileSync(filePath, text.replace(hardenedMatch[0], replacement));
    }
    return {
      healthy: missing.length === 0 || shouldRepair,
      changed: missing.length > 0 && shouldRepair,
      missing,
    };
  }

  const legacyMatch = text.match(/const DEFAULT_TOOLSETS = process\.env\.HERMES_YOLO_TOOLSETS \|\| '([^']+)';/);
  if (!legacyMatch) {
    return {
      healthy: false,
      changed: false,
      missing: [...REQUIRED_WRAPPER_CAPABILITIES],
      error: 'DEFAULT_TOOLSETS declaration not found',
    };
  }
  const toolsets = legacyMatch[1].split(',').map((item) => item.trim()).filter(Boolean);
  if (shouldRepair) {
    const baseToolsets = toolsets.filter((item) => !REQUIRED_WRAPPER_CAPABILITIES.includes(item)).join(',');
    fs.writeFileSync(filePath, text.replace(legacyMatch[0], hardenedWrapperBlock(baseToolsets)));
  }
  return {
    healthy: shouldRepair,
    changed: shouldRepair,
    missing: shouldRepair ? [] : [...REQUIRED_WRAPPER_CAPABILITIES],
  };
}

function parseSkillSummary(text) {
  const match = clean(text).match(/(\d+) enabled,\s*(\d+) disabled/);
  return match
    ? { enabled: Number(match[1]), disabled: Number(match[2]) }
    : { enabled: 0, disabled: null };
}

function gitState(repo, runner = run) {
  const status = runner('git', ['-C', repo, 'status', '--porcelain=v1'], 10_000);
  const counts = runner('git', ['-C', repo, 'rev-list', '--left-right', '--count', 'HEAD...origin/main'], 10_000);
  const [ahead = null, behind = null] = counts.stdout.trim().split(/\s+/).map(Number);
  return {
    dirty: Boolean(status.stdout.trim()),
    changedPaths: status.stdout.trim() ? status.stdout.trim().split('\n').length : 0,
    ahead: Number.isFinite(ahead) ? ahead : null,
    behind: Number.isFinite(behind) ? behind : null,
  };
}

function writeReceipt(receiptDir, receipt) {
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const encoded = `${JSON.stringify(receipt)}\n`;
  fs.writeFileSync(path.join(receiptDir, 'latest.json'), encoded, { mode: 0o600 });
  fs.appendFileSync(path.join(receiptDir, 'history.jsonl'), encoded, { mode: 0o600 });
}

function heal(options = {}) {
  const home = options.home || os.homedir();
  const hermes = options.hermes || process.env.HERMES_BIN || path.join(home, '.local/bin/hermes');
  const wrapper = options.wrapper || process.env.HERMES_YOLO_WRAPPER || path.join(home, '.hermes/hermes-yolo-wrapper.js');
  const repo = options.repo || process.env.HERMES_AGENT_REPO || path.join(home, '.hermes/hermes-agent');
  const receiptDir = options.receiptDir || process.env.HERMES_CAPABILITY_RECEIPT_DIR || path.join(home, '.hermes/receipts/capability-healer');
  const repair = options.repair !== false;
  const probeNetwork = options.probeNetwork !== false;
  const runner = options.runner || run;
  const actions = [];

  const wrapperResult = ensureWrapperCapabilities(wrapper, repair);
  actions.push({ action: 'wrapper_capabilities', ...wrapperResult });
  if (repair) {
    const contextEnable = runner(hermes, ['config', 'set', 'mcp_servers.context7.enabled', 'true']);
    actions.push({ action: 'enable_context7', code: contextEnable.code });
    const skillsEnable = runner(hermes, ['tools', 'enable', 'skills', '--platform', 'cli']);
    actions.push({ action: 'enable_skills', code: skillsEnable.code });
  }

  const contextConfig = runner(hermes, ['config', 'get', 'mcp_servers.context7.enabled']);
  const tools = runner(hermes, ['tools', 'list']);
  const skills = runner(hermes, ['skills', 'list']);
  const mcp = runner(hermes, ['mcp', 'list']);
  const mcpProbe = probeNetwork ? runner(hermes, ['mcp', 'test', 'context7'], 45_000) : null;
  const skillSummary = parseSkillSummary(skills.stdout);
  const checks = {
    wrapperHasSkillsAndContext7: ensureWrapperCapabilities(wrapper, false).healthy,
    skillsToolsetEnabled: /enabled\s+skills\s+/i.test(tools.stdout),
    enabledSkills: skillSummary.enabled,
    disabledSkills: skillSummary.disabled,
    context7Enabled: contextConfig.code === 0
      && /true/i.test(contextConfig.stdout.trim())
      && /context7[\s\S]*enabled/i.test(mcp.stdout),
    context7Connected: mcpProbe
      ? mcpProbe.code === 0
        && /Connected/i.test(mcpProbe.stdout)
        && /Tools discovered:\s*[1-9]/i.test(mcpProbe.stdout)
      : null,
  };
  const healthy = checks.wrapperHasSkillsAndContext7
    && checks.skillsToolsetEnabled
    && checks.enabledSkills > 0
    && checks.context7Enabled
    && checks.context7Connected === true;
  const receipt = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    mode: repair ? 'repair' : 'check',
    healthy,
    checks,
    updater: gitState(repo, runner),
    actions,
  };
  if (options.writeReceipt !== false) writeReceipt(receiptDir, receipt);
  return receipt;
}

function main() {
  const receipt = heal({
    repair: !process.argv.includes('--check-only'),
    probeNetwork: !process.argv.includes('--skip-network'),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = receipt.healthy ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  REQUIRED_WRAPPER_CAPABILITIES,
  clean,
  ensureWrapperCapabilities,
  gitState,
  heal,
  parseSkillSummary,
};
