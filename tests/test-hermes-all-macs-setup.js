'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildMachines,
  buildReport,
  dgmActions,
  isTailscaleIpv4,
  parseArgs,
  providerCandidates,
  readEnvFile,
  readinessGates,
  render,
} = require('../tools/hermes-all-macs-setup');

assert.deepStrictEqual(parseArgs(['--json', '--hosts', '100.70.1.2,mini.ts.net']).hosts, ['100.70.1.2', 'mini.ts.net']);
assert.strictEqual(parseArgs(['--skip-probes']).skipProbes, true);
assert.throws(() => parseArgs(['--bad']), /Unknown argument/);

assert.strictEqual(isTailscaleIpv4('100.64.0.1'), true);
assert.strictEqual(isTailscaleIpv4('100.127.255.254'), true);
assert.strictEqual(isTailscaleIpv4('100.128.0.1'), false);
assert.strictEqual(isTailscaleIpv4('192.168.1.10'), false);

const providersNoKeys = providerCandidates({});
assert(providersNoKeys.some((provider) => provider.id === 'openrouter-fugu-ultra' && provider.status === 'missing_openrouter_key'));
assert(providersNoKeys.every((provider) => provider.apiKeyPresent === false));

const providersOpenRouter = providerCandidates({ OPENROUTER_API_KEY: 'not-printed' });
const openRouter = providersOpenRouter.find((provider) => provider.id === 'openrouter-fugu-ultra');
assert.strictEqual(openRouter.status, 'smoke_ready');
assert.strictEqual(openRouter.runnableSmoke, true);
assert.strictEqual(openRouter.model, 'sakana/fugu-ultra');
assert(!JSON.stringify(openRouter).includes('not-printed'));

const providersDirect = providerCandidates({ SAKANA_API_KEY: 'not-printed', SAKANA_BASE_URL: 'https://example.invalid/v1' });
const direct = providersDirect.find((provider) => provider.id === 'sakana-direct-fugu');
assert.strictEqual(direct.status, 'needs_direct_endpoint_confirmation');
assert.strictEqual(direct.apiKeyPresent, true);
assert(!JSON.stringify(direct).includes('not-printed'));

const machines = buildMachines(
  {
    hostname: 'local-mac',
    localTailscaleIps: ['100.70.1.1'],
  },
  {
    machines: [{ id: 'mini', name: 'Igors-Mac-mini', host: '100.94.135.78', role: 'tailnet' }],
  },
  {
    discoveries: [
      {
        host: '100.94.135.78',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini',
        hermesVersion: '1.2.3',
      },
    ],
  },
  false,
);
assert.strictEqual(machines.length, 2);
assert.strictEqual(machines[1].gateway.reachable, true);
assert.strictEqual(machines[1].gateway.gatewayUrl, 'http://100.94.135.78:8642');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-all-macs-'));
fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'tools', 'hermes-discover-tailscale-macs.js'), 'ok\n');
const report = buildReport({
  repo: tmp,
  skipProbes: true,
  hosts: ['100.94.135.78'],
  inventory: path.join(tmp, 'missing-inventory.json'),
  env: { OPENROUTER_API_KEY: 'not-printed' },
});
assert.strictEqual(report.schema, 'hermes-all-macs-setup/v1');
assert.strictEqual(report.discovery.skipped, true);
assert(report.providers.some((provider) => provider.id === 'openrouter-fugu-ultra' && provider.runnableSmoke));
assert(report.gates.some((gate) => gate.id === 'sakana_fugu_candidate' && gate.ok));
assert(report.nextActions.some((action) => action.includes('capped smoke')));
assert(!JSON.stringify(report).includes('not-printed'));
assert(render(report).includes('Sakana/Fugu Candidates'));

const gates = readinessGates(
  {
    localTailscaleIps: [],
    files: {
      hermesConfig: { exists: false },
      aiVaultState: { exists: false },
      aiVaultValidation: { exists: false },
    },
  },
  [{ name: 'local', gateway: null }],
  providersNoKeys,
);
assert(gates.filter((gate) => !gate.ok).length >= 4);
assert(dgmActions(gates, providersNoKeys).some((action) => action.includes('Tailscale')));

const testEnvPath = path.join(tmp, 'test.env');
fs.writeFileSync(testEnvPath, 'TEST_KEY=test_value\n# Comment\n  OTHER_KEY = "other_value"\n');
const parsedEnv = readEnvFile(testEnvPath);
assert.strictEqual(parsedEnv.TEST_KEY, 'test_value');
assert.strictEqual(parsedEnv.OTHER_KEY, 'other_value');
assert.strictEqual(Object.keys(parsedEnv).length, 2);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes all-Macs setup tests: PASS');
