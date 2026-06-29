#!/usr/bin/env node
'use strict';

/**
 * Hermes all-Macs setup verifier.
 *
 * Applies Sakana/DGM-style gates to our actual Hermes fleet:
 * inventory -> probe -> score -> recommend -> adopt only after evidence.
 *
 * The tool is read-only unless --write is passed. It never prints secret values;
 * provider readiness is based on env-var presence only.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'all-macs-setup-latest.json');
const DEFAULT_INVENTORY = path.join(os.homedir(), '.hermes', 'all-macs.json');
const GATEWAY_PORT = 8642;

const SAKANA_SOURCES = [
  {
    id: 'sakana-home',
    url: 'https://sakana.ai/',
    evidence: 'Sakana AI positions itself around nature-inspired intelligence and points product users to Fugu.',
  },
  {
    id: 'sakana-fugu',
    url: 'https://sakana.ai/fugu/',
    evidence: 'Sakana Fugu is presented as a multi-agent system delivered as one OpenAI-compatible model API.',
  },
  {
    id: 'sakana-dgm',
    url: 'https://sakana.ai/dgm/',
    evidence: 'Darwin Godel Machine pattern: keep an archive of candidates, evaluate empirically, and retain lineage.',
  },
];

const SAKANA_PROVIDER_CANDIDATES = [
  {
    id: 'openrouter-fugu-ultra',
    label: 'Sakana Fugu Ultra via OpenRouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'sakana/fugu-ultra',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    bestFor: 'hard multi-step reasoning, paper/code investigations, and high-stakes review after cost gates pass',
    statusWhenKeyPresent: 'smoke_ready',
    statusWhenKeyMissing: 'missing_openrouter_key',
  },
  {
    id: 'sakana-direct-fugu',
    label: 'Sakana Fugu direct API',
    provider: 'sakana',
    baseUrlEnv: 'SAKANA_BASE_URL',
    model: 'fugu',
    apiKeyEnv: 'SAKANA_API_KEY',
    bestFor: 'balanced everyday coding and interactive Hermes work after endpoint and region are confirmed',
    statusWhenKeyPresent: 'needs_direct_endpoint_confirmation',
    statusWhenKeyMissing: 'missing_sakana_key',
  },
  {
    id: 'sakana-direct-fugu-ultra',
    label: 'Sakana Fugu Ultra direct API',
    provider: 'sakana',
    baseUrlEnv: 'SAKANA_BASE_URL',
    model: 'fugu-ultra-20260615',
    apiKeyEnv: 'SAKANA_API_KEY',
    bestFor: 'complex multi-step reasoning where slower, deeper agent coordination is worth the cost',
    statusWhenKeyPresent: 'needs_direct_endpoint_confirmation',
    statusWhenKeyMissing: 'missing_sakana_key',
  },
];

function usage() {
  return `Usage:
  node tools/hermes-all-macs-setup.js [--json] [--repo PATH] [--inventory PATH] [--hosts HOSTS] [--skip-probes] [--write] [--out PATH]

Builds a source-backed all-Macs Hermes setup report:
- local Mac runtime facts
- Tailscale/Hermes gateway reachability
- AI vault and sync artifact readiness
- Sakana/Fugu provider candidates with DGM-style adoption gates

No runtime defaults are changed by this verifier.`;
}

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    inventory: DEFAULT_INVENTORY,
    hosts: [],
    json: false,
    write: false,
    out: DEFAULT_OUT,
    skipProbes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--inventory') args.inventory = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--hosts') args.hosts = splitCsv(requireValue(argv, ++i, arg));
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--skip-probes') args.skipProbes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || DEFAULT_REPO,
    encoding: 'utf8',
    timeout: options.timeout || 8000,
    maxBuffer: 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function fileState(filePath) {
  if (!fs.existsSync(filePath)) return { path: filePath, exists: false };
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    exists: true,
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function isTailscaleIpv4(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

function localTailscaleIps() {
  const ips = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const info of entries || []) {
      if (info.family === 'IPv4' && !info.internal && isTailscaleIpv4(info.address)) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

function localLanIps() {
  const ips = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const info of entries || []) {
      if (info.family === 'IPv4' && !info.internal && !isTailscaleIpv4(info.address)) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

function readInventory(inventoryPath) {
  if (!fs.existsSync(inventoryPath)) return { exists: false, path: inventoryPath, machines: [] };
  const parsed = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const machines = Array.isArray(parsed) ? parsed : parsed.machines || [];
  return {
    exists: true,
    path: inventoryPath,
    machines: machines.map(normalizeInventoryMachine).filter(Boolean),
  };
}

function normalizeInventoryMachine(machine) {
  if (!machine || typeof machine !== 'object') return null;
  const host = machine.host || machine.tailscaleIp || machine.ip || machine.hostname;
  return {
    id: machine.id || machine.name || host,
    name: machine.name || machine.hostname || host,
    host,
    role: machine.role || 'inventory',
    expectedGateway: machine.expectedGateway !== false,
  };
}

function probeGateway(host) {
  if (!host) return null;
  const hostOnly = String(host).replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  const url = `http://${hostOnly}:${GATEWAY_PORT}`;
  const result = run('curl', ['-sf', '--max-time', '3', `${url}/health`], { timeout: 4000 });
  if (!result.ok || !result.stdout) {
    return {
      host: hostOnly,
      gatewayUrl: url,
      reachable: false,
      status: result.status,
    };
  }
  try {
    const body = JSON.parse(result.stdout);
    return {
      host: hostOnly,
      gatewayUrl: url,
      reachable: body.status === 'ok',
      hostname: body.hostname || null,
      localIp: body.local_ip || body.localIp || null,
      hermesVersion: body.hermes_version || body.version || null,
    };
  } catch {
    return {
      host: hostOnly,
      gatewayUrl: url,
      reachable: false,
      parseError: true,
    };
  }
}

function discoverTailscaleGateways(repo, hosts, skipProbes) {
  if (skipProbes) return { skipped: true, discoveries: [], probedHosts: hosts };
  const scriptPath = path.join(repo, 'tools', 'hermes-discover-tailscale-macs.js');
  if (!fs.existsSync(scriptPath)) return { skipped: true, reason: 'missing_discovery_tool', discoveries: [], probedHosts: hosts };
  const args = [scriptPath, '--json'];
  if (hosts.length > 0) args.push('--hosts', hosts.join(','));
  const result = run(process.execPath, args, { cwd: repo, timeout: 15000 });
  if (!result.ok || !result.stdout) {
    return {
      skipped: false,
      ok: false,
      error: result.stderr || `exit ${result.status}`,
      discoveries: [],
      probedHosts: hosts,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      skipped: false,
      ok: true,
      localTailscaleIp: parsed.localTailscaleIp || null,
      probedHosts: parsed.probedHosts || [],
      discoveries: parsed.discoveries || [],
    };
  } catch (error) {
    return {
      skipped: false,
      ok: false,
      error: error.message,
      discoveries: [],
      probedHosts: hosts,
    };
  }
}

function collectRuntime(repo) {
  const hermesDir = path.join(os.homedir(), '.hermes');
  const aiVault = path.join(hermesDir, 'ai-vault');
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    repo,
    localTailscaleIps: localTailscaleIps(),
    localLanIps: localLanIps(),
    files: {
      hermesDir: fileState(hermesDir),
      hermesConfig: fileState(path.join(hermesDir, 'config.yaml')),
      hermesEnv: fileState(path.join(hermesDir, '.env')),
      aiVault: fileState(aiVault),
      aiVaultState: fileState(path.join(aiVault, 'state.json')),
      aiVaultValidation: fileState(path.join(aiVault, 'VALIDATION-REPORT.md')),
      agentSyncJson: fileState(path.join(repo, 'artifacts', 'agent-sync', 'Hermes-Agent-Sync.json')),
      latestE2e: fileState(path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json')),
    },
  };
}

function providerCandidates(env = process.env) {
  return SAKANA_PROVIDER_CANDIDATES.map((candidate) => {
    const keyPresent = Boolean(env[candidate.apiKeyEnv]);
    const baseUrlPresent = candidate.baseUrl ? true : Boolean(env[candidate.baseUrlEnv]);
    let status = keyPresent ? candidate.statusWhenKeyPresent : candidate.statusWhenKeyMissing;
    if (keyPresent && candidate.baseUrlEnv && !baseUrlPresent) status = 'missing_direct_base_url';
    const runnableSmoke = keyPresent && baseUrlPresent && candidate.provider === 'openrouter';
    return {
      ...candidate,
      apiKeyPresent: keyPresent,
      baseUrlPresent,
      status,
      runnableSmoke,
      secretPolicy: 'env_presence_only; key values are never read or printed',
    };
  });
}

function buildMachines(runtime, inventory, discovery, skipProbes) {
  const machines = [];
  const localProbe = skipProbes ? null : probeGateway('127.0.0.1');
  machines.push({
    id: runtime.hostname,
    name: runtime.hostname,
    role: 'local',
    hosts: ['127.0.0.1', ...runtime.localTailscaleIps],
    gateway: localProbe,
  });

  const byHost = new Map();
  for (const machine of inventory.machines) {
    if (machine.host) byHost.set(machine.host, machine);
  }
  for (const found of discovery.discoveries || []) {
    byHost.set(found.host, {
      id: found.hostname || found.label || found.host,
      name: found.hostname || found.label || found.host,
      host: found.host,
      role: 'tailnet',
      expectedGateway: true,
      discoveredGateway: found,
    });
  }
  for (const machine of byHost.values()) {
    const gateway = machine.discoveredGateway
      ? {
          host: machine.discoveredGateway.host,
          gatewayUrl: machine.discoveredGateway.gatewayUrl,
          reachable: true,
          hostname: machine.discoveredGateway.hostname || null,
          localIp: machine.discoveredGateway.localIp || null,
          hermesVersion: machine.discoveredGateway.hermesVersion || null,
        }
      : skipProbes || !machine.expectedGateway
        ? null
        : probeGateway(machine.host);
    machines.push({
      id: machine.id,
      name: machine.name,
      role: machine.role,
      hosts: [machine.host].filter(Boolean),
      gateway,
    });
  }
  return machines;
}

function statusForMachine(machine) {
  if (!machine.gateway) return 'unknown_not_probed';
  if (machine.gateway.reachable) return 'gateway_online';
  return 'gateway_unreachable';
}

function readinessGates(runtime, machines, providers) {
  const gatewayOnlineCount = machines.filter((machine) => statusForMachine(machine) === 'gateway_online').length;
  const gates = [
    {
      id: 'tailnet_identity',
      ok: runtime.localTailscaleIps.length > 0,
      evidence: runtime.localTailscaleIps.length > 0 ? runtime.localTailscaleIps.join(', ') : 'no local 100.x tailnet IP detected',
    },
    {
      id: 'local_hermes_config',
      ok: runtime.files.hermesConfig.exists,
      evidence: runtime.files.hermesConfig.exists ? runtime.files.hermesConfig.path : 'missing ~/.hermes/config.yaml',
    },
    {
      id: 'ai_vault_installed',
      ok: runtime.files.aiVaultState.exists && runtime.files.aiVaultValidation.exists,
      evidence: runtime.files.aiVaultState.exists ? runtime.files.aiVaultState.path : 'missing ~/.hermes/ai-vault/state.json',
    },
    {
      id: 'gateway_matrix',
      ok: gatewayOnlineCount > 0,
      evidence: `${gatewayOnlineCount}/${machines.length} machines currently show Hermes gateway online`,
    },
    {
      id: 'sakana_fugu_candidate',
      ok: providers.some((provider) => provider.status === 'smoke_ready' || provider.runnableSmoke),
      evidence: providers.map((provider) => `${provider.id}:${provider.status}`).join(', '),
    },
  ];
  return gates;
}

function dgmActions(gates, providers) {
  const actions = [];
  const failed = gates.filter((gate) => !gate.ok).map((gate) => gate.id);
  if (failed.includes('tailnet_identity')) {
    actions.push('Restore Tailscale identity before cross-Mac Hermes routing; do not depend on LAN-only discovery.');
  }
  if (failed.includes('ai_vault_installed')) {
    actions.push('Run the existing Hermes AI vault install path, then validate the installed vault before sharing context across Macs.');
  }
  if (failed.includes('gateway_matrix')) {
    actions.push('Bring at least one Hermes gateway online over tailnet :8642/health before changing mobile or provider routing.');
  }
  const smokeReady = providers.filter((provider) => provider.runnableSmoke);
  if (smokeReady.length > 0) {
    actions.push(`Run a capped smoke for ${smokeReady.map((provider) => provider.id).join(', ')} and record latency/cost/quality before default promotion.`);
  } else {
    actions.push('Keep Sakana/Fugu as a candidate route until API key, endpoint, region, cost, and smoke evidence are present.');
  }
  actions.push('Adopt setup changes only through the recursive experiment ledger after evaluator, reward-hack, and variance checks pass.');
  return actions;
}

function buildReport(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const inventory = readInventory(options.inventory || DEFAULT_INVENTORY);
  const runtime = collectRuntime(repo);
  const discovery = discoverTailscaleGateways(repo, options.hosts || [], Boolean(options.skipProbes));
  const machines = buildMachines(runtime, inventory, discovery, Boolean(options.skipProbes)).map((machine) => ({
    ...machine,
    status: statusForMachine(machine),
  }));
  const providers = providerCandidates(options.env || process.env);
  const gates = readinessGates(runtime, machines, providers);
  const overallReady = gates.every((gate) => gate.ok);
  return {
    schema: 'hermes-all-macs-setup/v1',
    generatedAt: new Date().toISOString(),
    sourcePattern: 'Sakana Fugu multi-agent API plus Darwin Godel Machine empirical adoption gates.',
    sources: SAKANA_SOURCES,
    repo,
    inventory,
    runtime,
    discovery,
    machines,
    providers,
    gates,
    overallReady,
    nextActions: dgmActions(gates, providers),
    boundaries: [
      'This verifier does not change Hermes defaults.',
      'Provider routes are candidates until capped smoke tests and cost gates pass.',
      'Vault/sync artifacts are context proof, not business outcome proof.',
      'Mobile E2E readiness remains separate from all-Macs setup readiness.',
    ],
  };
}

function render(report) {
  const lines = [
    '# Hermes All-Macs Setup Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Overall ready: ${report.overallReady ? 'yes' : 'no'}`,
    '',
    '## Machines',
    '',
  ];
  for (const machine of report.machines) {
    lines.push(`- ${machine.name} (${machine.role}): ${machine.status}`);
    if (machine.gateway?.gatewayUrl) lines.push(`  gateway: ${machine.gateway.gatewayUrl}`);
  }
  lines.push('', '## Gates', '');
  for (const gate of report.gates) {
    lines.push(`- ${gate.ok ? 'PASS' : 'FAIL'} ${gate.id}: ${gate.evidence}`);
  }
  lines.push('', '## Sakana/Fugu Candidates', '');
  for (const provider of report.providers) {
    lines.push(`- ${provider.id}: ${provider.status}; model=${provider.model}; key=${provider.apiKeyPresent ? 'present' : 'missing'}`);
  }
  lines.push('', '## Next Actions', '');
  for (const action of report.nextActions) lines.push(`- ${action}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = buildReport(args);
  if (args.write) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(render(report));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error(usage());
    process.exit(2);
  }
}

module.exports = {
  SAKANA_PROVIDER_CANDIDATES,
  buildMachines,
  buildReport,
  dgmActions,
  isTailscaleIpv4,
  parseArgs,
  providerCandidates,
  readinessGates,
  render,
};
