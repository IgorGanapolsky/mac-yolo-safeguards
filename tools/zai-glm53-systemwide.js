#!/usr/bin/env node
'use strict';

/**
 * zai-glm53-systemwide.js — persist GLM-5.3 + $10/mo cap on every user launch path
 *
 * Does not replace SuperGrok as the default interactive coder.
 * Cyber/audit tasks (SCMP / CyberGym) ride the Coding Plan when
 * HERMES_PREFER_GLM53_CYBER=1. Metered API stays $10 fail-closed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const budget = require('./zai-api-budget-guard');
const fleet = require('./zai-glm53-fleet');

const SHELL_MARK_BEGIN = '# >>> zai-glm53-fleet >>>';
const SHELL_MARK_END = '# <<< zai-glm53-fleet <<<';
const PLIST_LABEL = 'com.igor.zai-glm53-env';

const SHELL_BLOCK = `${SHELL_MARK_BEGIN}
# GLM-5.3 Coding Plan is $0 tokens. Metered Z.AI / OpenRouter capped at $10/mo.
export HERMES_TOKEN_BUDGET_USD=10.00
export HERMES_GLM_MODEL=glm-5.3
export HERMES_PREFER_GLM53_CYBER=1
export PATH="$HOME/.local/bin:$PATH"
${SHELL_MARK_END}
`;

function launchAgentsDir(home) {
  return path.join(home, 'Library', 'LaunchAgents');
}

function plistBody() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv HERMES_TOKEN_BUDGET_USD 10.00; launchctl setenv HERMES_GLM_MODEL glm-5.3; launchctl setenv HERMES_PREFER_GLM53_CYBER 1</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

function upsertMarkedBlock(raw, block) {
  const src = String(raw || '');
  const blockNorm = block.endsWith('\n') ? block : `${block}\n`;
  const start = src.indexOf(SHELL_MARK_BEGIN);
  const end = src.indexOf(SHELL_MARK_END);
  if (start >= 0 && end > start) {
    const before = src.slice(0, start).replace(/\s+$/, '');
    const after = src.slice(end + SHELL_MARK_END.length).replace(/^\n/, '');
    const head = before ? `${before}\n\n` : '';
    return `${head}${blockNorm}${after}`;
  }
  const prefix = src.replace(/\s+$/, '');
  return prefix ? `${prefix}\n\n${blockNorm}` : blockNorm;
}

function applyShellRc(options = {}) {
  const home = options.home || os.homedir();
  const files = options.files || [
    path.join(home, '.zshrc'),
    path.join(home, '.zprofile'),
  ];
  const results = [];
  for (const file of files) {
    const existed = fs.existsSync(file);
    const prev = existed ? fs.readFileSync(file, 'utf8') : '';
    const next = upsertMarkedBlock(prev, SHELL_BLOCK);
    if (next !== prev) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, next.endsWith('\n') ? next : `${next}\n`);
    }
    results.push({ path: file, changed: next !== prev, existed });
  }
  return results;
}

function applyLaunchAgent(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.plistPath || path.join(launchAgentsDir(home), `${PLIST_LABEL}.plist`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const body = plistBody();
  const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (prev !== body) fs.writeFileSync(dest, body);
  const loaded = [];
  if (!options.skipLoad) {
    spawnSync('launchctl', ['unload', dest], { encoding: 'utf8' });
    const r = spawnSync('launchctl', ['load', '-w', dest], { encoding: 'utf8' });
    loaded.push({ dest, ok: r.status === 0, stderr: (r.stderr || '').slice(0, 200) });
    spawnSync('launchctl', ['setenv', 'HERMES_TOKEN_BUDGET_USD', '10.00']);
    spawnSync('launchctl', ['setenv', 'HERMES_GLM_MODEL', 'glm-5.3']);
    spawnSync('launchctl', ['setenv', 'HERMES_PREFER_GLM53_CYBER', '1']);
  }
  return { path: dest, changed: prev !== body, loaded };
}

function applyYoloRoutePlist(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.plistPath || path.join(launchAgentsDir(home), 'com.igor.hermes-yolo-route.plist');
  if (!fs.existsSync(dest) && !options.createIfMissing) {
    return { path: dest, skipped: true };
  }
  let raw = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (!raw.includes('HERMES_TOKEN_BUDGET_USD')) {
    raw = raw.replace(
      /launchctl setenv HERMES_YOLO_BACKEND hermes/,
      'launchctl setenv HERMES_YOLO_BACKEND hermes; launchctl setenv HERMES_TOKEN_BUDGET_USD 10.00; launchctl setenv HERMES_GLM_MODEL glm-5.3; launchctl setenv HERMES_PREFER_GLM53_CYBER 1',
    );
    if (raw.includes('HERMES_TOKEN_BUDGET_USD')) fs.writeFileSync(dest, raw);
  }
  return { path: dest, patched: raw.includes('HERMES_TOKEN_BUDGET_USD') };
}

function applyOpenCodeProvider(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.opencodePath || path.join(home, '.config', 'opencode', 'opencode.json');
  if (!fs.existsSync(dest) && !options.createIfMissing) {
    return { path: dest, skipped: true };
  }
  let data = {};
  if (fs.existsSync(dest)) {
    data = JSON.parse(fs.readFileSync(dest, 'utf8'));
  }
  const defaultBefore = data.model;
  data.provider = data.provider || {};
  data.provider.hermes = {
    npm: '@ai-sdk/openai-compatible',
    name: 'Hermes LiteLLM (GLM-5.3 Coding Plan)',
    options: {
      baseURL: 'http://127.0.0.1:4010/v1',
      apiKey: 'sk-hermes-local-dev',
    },
    models: {
      'glm-coding': {
        name: 'GLM Coding Plan (auto-routes to 5.3)',
        reasoning: true,
        limit: { context: 1000000, output: 128000 },
      },
      'glm-5.3': {
        name: 'GLM-5.3 Coding Plan',
        reasoning: true,
        limit: { context: 1000000, output: 128000 },
      },
    },
  };
  // Never steal the operator default (currently muse-spark on this Mac).
  if (options.setDefault === true) data.model = 'hermes/glm-coding';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
  return { path: dest, defaultUnchanged: data.model === defaultBefore, model: data.model };
}

function applyOpenCodeSkill(options = {}) {
  const home = options.home || os.homedir();
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const src = path.join(repoRoot, '.agents', 'skills', 'zai-glm53-fleet');
  const dest = path.join(home, '.config', 'opencode', 'skills', 'zai-glm53-fleet');
  if (!fs.existsSync(src)) return { dest, status: 'missing_src' };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.lstatSync(dest);
    return { dest, status: 'exists' };
  } catch {
    /* missing */
  }
  try {
    fs.symlinkSync(src, dest);
    return { dest, status: 'linked' };
  } catch (err) {
    return { dest, status: err.code === 'EEXIST' ? 'exists' : 'error', error: err.message };
  }
}

function isCyberTask(taskText = '') {
  return /\b(cyber|cybergym|mythos|vulnerability|cve|exploitbench|security audit|code audit|pentest)\b/i.test(
    String(taskText),
  );
}

function classifyCyber(taskText = '') {
  const route = fleet.classifyRoute(taskText || 'security audit');
  const gate = budget.checkGate(0.05, fleet.ROUTES.openrouter);
  return {
    primary: fleet.ROUTES['zai-coding-plan'],
    effort: 'max',
    thinking: budget.thinkingBody('max'),
    meteredFallback: null,
    reason: 'SCMP/CyberGym cyber-defence work stays on Coding Plan ($0). Metered API denied by policy.',
    budget: budget.getBudgetPacingStatus(),
    openrouterWouldAllow: gate.allowed,
    cyber: isCyberTask(taskText || 'security audit'),
    route,
  };
}

function runSystemDoctor(options = {}) {
  const home = options.home || os.homedir();
  const plist = path.join(launchAgentsDir(home), `${PLIST_LABEL}.plist`);
  const zshrc = path.join(home, '.zshrc');
  const oc = path.join(home, '.config', 'opencode', 'opencode.json');
  const getenv = (k) => {
    const r = spawnSync('launchctl', ['getenv', k], { encoding: 'utf8' });
    return (r.stdout || '').trim();
  };
  const zsh = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';
  let opencodeHasHermes = false;
  if (fs.existsSync(oc)) {
    try {
      const data = JSON.parse(fs.readFileSync(oc, 'utf8'));
      opencodeHasHermes = Boolean(data.provider && data.provider.hermes);
    } catch {
      opencodeHasHermes = false;
    }
  }
  const fleetDoc = fleet.runDoctor(options);
  const envOk =
    getenv('HERMES_TOKEN_BUDGET_USD') === '10.00' && getenv('HERMES_GLM_MODEL') === 'glm-5.3';
  const shellOk = zsh.includes(SHELL_MARK_BEGIN) && zsh.includes('HERMES_TOKEN_BUDGET_USD=10.00');
  return {
    engine: 'GLM-5.3 system-wide',
    monthlyBudgetUsd: 10,
    plistPresent: fs.existsSync(plist),
    shellBlockPresent: shellOk,
    launchEnvOk: envOk,
    opencodeHermesProvider: opencodeHasHermes,
    preferCyber: getenv('HERMES_PREFER_GLM53_CYBER') === '1' || /HERMES_PREFER_GLM53_CYBER=1/.test(zsh),
    fleet: fleetDoc,
    budget: budget.getBudgetPacingStatus(),
    status:
      fleetDoc.status === 'healthy' && shellOk && fs.existsSync(plist) ? 'healthy' : 'needs_apply',
  };
}

function installSystemwide(options = {}) {
  const fleetOut = options.skipFleet ? { skipped: true } : fleet.install(options);
  const shell = applyShellRc(options);
  const agent = applyLaunchAgent(options);
  const yoloPlist = applyYoloRoutePlist(options);
  const opencode = applyOpenCodeProvider(options);
  const ocSkill = applyOpenCodeSkill(options);
  return {
    ok: true,
    fleet: fleetOut,
    shell,
    agent,
    yoloPlist,
    opencode,
    ocSkill,
    doctor: runSystemDoctor(options),
  };
}

async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const cmd = argv.find((a) => !a.startsWith('--')) || 'doctor';
  if (cmd === 'doctor') {
    const doc = runSystemDoctor();
    console.log(json ? JSON.stringify(doc, null, 2) : `${doc.status} shell=${doc.shellBlockPresent} plist=${doc.plistPresent}`);
    process.exit(doc.status === 'healthy' ? 0 : 1);
  }
  if (cmd === 'install' || cmd === 'apply') {
    const out = installSystemwide();
    console.log(json ? JSON.stringify(out, null, 2) : `systemwide ${out.doctor.status}`);
    return;
  }
  if (cmd === 'cyber') {
    const q = argv.filter((a) => !a.startsWith('--') && a !== 'cyber').join(' ') || 'security audit';
    const out = classifyCyber(q);
    console.log(
      json
        ? JSON.stringify(out, null, 2)
        : `cyber ${out.primary.model} effort=${out.effort} metered=false coding=${out.primary.baseUrl}`,
    );
    return;
  }
  console.error('usage: zai-glm53-systemwide <doctor|install|cyber> [--json]');
  process.exit(1);
}

module.exports = {
  SHELL_MARK_BEGIN,
  SHELL_BLOCK,
  PLIST_LABEL,
  upsertMarkedBlock,
  applyShellRc,
  applyLaunchAgent,
  applyYoloRoutePlist,
  applyOpenCodeProvider,
  classifyCyber,
  isCyberTask,
  runSystemDoctor,
  installSystemwide,
  plistBody,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
