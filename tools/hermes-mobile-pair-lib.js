'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');

function readEnvKey(filePath, names) {
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  for (const name of names) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function readLocalApiKey(hermesEnvPath = DEFAULT_HERMES_ENV) {
  return readEnvKey(hermesEnvPath, ['API_SERVER_KEY', 'HERMES_API_SERVER_KEY', 'API_KEY']);
}

function gatewayUrlHost(gatewayUrl) {
  try {
    return new URL(gatewayUrl.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isMacMiniGatewayUrl(gatewayUrl) {
  const host = gatewayUrlHost(gatewayUrl);
  return host === '100.94.135.78' || /mac-mini|igors-mac-mini/.test(host);
}

/** Fleet Macs can have different API_SERVER_KEY values — fetch the target machine's key over SSH. */
function resolveApiKeyForGatewayUrl(gatewayUrl, options = {}) {
  const hermesEnvPath = options.hermesEnvPath ?? DEFAULT_HERMES_ENV;
  const localKey = readLocalApiKey(hermesEnvPath);
  if (!gatewayUrl?.trim() || !isMacMiniGatewayUrl(gatewayUrl)) {
    return localKey;
  }
  const remote = spawnSync(
    options.sshCommand ?? 'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=8',
      options.sshHost ?? 'hermes-mini',
      "grep -E '^API_SERVER_KEY=' ~/.hermes/.env | cut -d= -f2-",
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  const remoteKey = remote.stdout?.trim();
  if (remote.status === 0 && remoteKey) {
    return remoteKey;
  }
  return localKey;
}

module.exports = {
  DEFAULT_HERMES_ENV,
  readEnvKey,
  readLocalApiKey,
  gatewayUrlHost,
  isMacMiniGatewayUrl,
  resolveApiKeyForGatewayUrl,
};
