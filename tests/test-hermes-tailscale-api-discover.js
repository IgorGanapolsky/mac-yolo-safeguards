'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  OAUTH_TOKEN_URL,
  READ_SCOPE,
  devicesToProbeHosts,
  discoverTailnetHosts,
  safeErrorMessage,
} = require('../tools/hermes-tailscale-api-discover.js');

const NOW = Date.parse('2026-07-21T18:00:00Z');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

async function main() {
  const inventory = {
    devices: [
      {
        hostname: 'workstation',
        name: 'workstation.tail123.ts.net.',
        os: 'macOS',
        authorized: true,
        connectedToControl: true,
        expires: '2026-08-21T00:00:00Z',
        addresses: ['100.87.85.85', 'fd7a:115c:a1e0::1'],
      },
      {
        hostname: 'linux-box',
        name: 'linux-box.tail123.ts.net',
        os: 'linux',
        authorized: true,
        connectedToControl: false,
        lastSeen: '2026-07-21T17:50:00Z',
        addresses: ['100.94.135.78'],
      },
      {
        hostname: 'old-windows',
        name: 'old-windows.tail123.ts.net',
        os: 'windows',
        authorized: true,
        connectedToControl: false,
        lastSeen: '2026-07-20T17:50:00Z',
        addresses: ['100.80.0.3'],
      },
      {
        hostname: 'phone',
        name: 'phone.tail123.ts.net',
        os: 'android',
        authorized: true,
        connectedToControl: true,
        addresses: ['100.70.124.54'],
      },
      {
        hostname: 'expired-mac',
        name: 'expired-mac.tail123.ts.net',
        os: 'macOS',
        authorized: true,
        connectedToControl: true,
        expires: '2026-07-20T00:00:00Z',
        addresses: ['100.80.0.4'],
      },
      {
        hostname: 'unauthorized-mac',
        name: 'unauthorized-mac.tail123.ts.net',
        os: 'macOS',
        authorized: false,
        connectedToControl: true,
        addresses: ['100.80.0.5'],
      },
    ],
  };

  assert.deepStrictEqual(devicesToProbeHosts(inventory, NOW), [
    'workstation.tail123.ts.net',
    '100.87.85.85',
    'linux-box.tail123.ts.net',
    '100.94.135.78',
  ]);

  let fetchCalls = 0;
  const oauthFetch = async (url, options = {}) => {
    fetchCalls += 1;
    if (url === OAUTH_TOKEN_URL) {
      assert.strictEqual(options.method, 'POST');
      assert.match(options.headers.Authorization, /^Basic /);
      assert(!options.headers.Authorization.includes('test-secret'));
      const form = new URLSearchParams(options.body);
      assert.strictEqual(form.get('grant_type'), 'client_credentials');
      assert.strictEqual(form.get('scope'), READ_SCOPE);
      return response({ access_token: 'test-token', expires_in: 3600 });
    }
    assert.strictEqual(url, 'https://api.tailscale.com/api/v2/tailnet/-/devices');
    assert.strictEqual(options.headers.Authorization, 'Bearer test-token');
    return response(inventory);
  };

  const oauthResult = await discoverTailnetHosts({
    env: {
      TAILSCALE_OAUTH_CLIENT_ID: 'test-id',
      TAILSCALE_OAUTH_CLIENT_SECRET: 'test-secret',
    },
    fetchImpl: oauthFetch,
    nowMs: NOW,
  });
  assert.strictEqual(fetchCalls, 2);
  assert.strictEqual(oauthResult.credentialType, 'oauth_client');
  assert.strictEqual(oauthResult.deviceCount, 6);
  assert.strictEqual(oauthResult.candidateCount, 4);
  assert(!JSON.stringify(oauthResult).includes('test-token'));
  assert(!JSON.stringify(oauthResult).includes('test-secret'));

  let accessTokenRequest;
  const accessTokenResult = await discoverTailnetHosts({
    env: {
      TAILSCALE_API_ACCESS_TOKEN: 'test-token',
      TAILSCALE_TAILNET: 'example.com',
    },
    fetchImpl: async (url, options) => {
      accessTokenRequest = { url, options };
      return response({ devices: [] });
    },
    nowMs: NOW,
  });
  assert.strictEqual(
    accessTokenRequest.url,
    'https://api.tailscale.com/api/v2/tailnet/example.com/devices',
  );
  assert.strictEqual(accessTokenRequest.options.headers.Authorization, 'Bearer test-token');
  assert.strictEqual(accessTokenResult.credentialType, 'access_token');
  assert(!JSON.stringify(accessTokenResult).includes('test-token'));

  let noCredentialFetches = 0;
  const unconfigured = await discoverTailnetHosts({
    env: {},
    fetchImpl: async () => {
      noCredentialFetches += 1;
      return response({});
    },
  });
  assert.strictEqual(noCredentialFetches, 0);
  assert.deepStrictEqual(unconfigured.hosts, []);
  assert.strictEqual(unconfigured.configured, false);

  await assert.rejects(
    discoverTailnetHosts({ env: { TAILSCALE_OAUTH_CLIENT_ID: 'id-only' } }),
    /requires both client ID and client secret/,
  );
  assert.strictEqual(
    safeErrorMessage(new Error('Bearer opaque-test-value failed')),
    'Bearer [redacted] failed',
  );

  const repo = path.resolve(__dirname, '..');
  const noCredentialCli = spawnSync(
    process.execPath,
    [path.join(repo, 'tools/hermes-tailscale-api-discover.js'), '--hosts-only'],
    {
      cwd: repo,
      encoding: 'utf8',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('TAILSCALE_')),
      ),
    },
  );
  assert.strictEqual(noCredentialCli.status, 0);
  assert.strictEqual(noCredentialCli.stdout, '\n');
  assert.strictEqual(noCredentialCli.stderr, '');

  const sessionStartSource = fs.readFileSync(
    path.join(repo, 'tools/agent-session-start.js'),
    'utf8',
  );
  assert.match(sessionStartSource, /hermes-tailscale-api-discover\.js/);
  assert.match(sessionStartSource, /HERMES_TAILNET_PROBE_HOSTS/);
  assert.match(sessionStartSource, /clearTailscaleApiCredentialsFromProcess\(\)/);
  assert.match(sessionStartSource, /delete process\.env\[key\]/);

  console.log('ok   tests/test-hermes-tailscale-api-discover.js');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
