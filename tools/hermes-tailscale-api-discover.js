#!/usr/bin/env node
'use strict';

/**
 * Optional computer-side Tailscale control-plane discovery.
 *
 * This file is deliberately outside hermes-mobile: OAuth client secrets and API
 * access tokens must never enter the Play/App Store bundle. The only output that
 * reaches pairing is a sanitized list of MagicDNS names and 100.64.0.0/10 IPs.
 */

const API_BASE_URL = 'https://api.tailscale.com/api/v2';
const OAUTH_TOKEN_URL = `${API_BASE_URL}/oauth/token`;
const READ_SCOPE = 'devices:core:read';
const DEFAULT_RECENT_MS = 15 * 60 * 1000;
const SUPPORTED_COMPUTER_OSES = new Set(['linux', 'macos', 'windows']);

function isTailscaleIpv4(value) {
  const ip = String(value || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const octets = ip.split('.').map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function normalizeMagicDnsName(value) {
  const name = String(value || '').trim().replace(/\.$/, '').toLowerCase();
  if (!name || !name.endsWith('.ts.net')) return null;
  if (!/^[a-z0-9.-]+$/.test(name)) return null;
  return name;
}

function parseDateMs(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEligibleComputerDevice(device, nowMs = Date.now(), recentMs = DEFAULT_RECENT_MS) {
  if (!device || typeof device !== 'object') return false;
  const deviceOs = String(device.os || '').trim().toLowerCase();
  if (!SUPPORTED_COMPUTER_OSES.has(deviceOs)) return false;
  if (device.authorized === false) return false;

  const expiresAt = parseDateMs(device.expires);
  if (expiresAt != null && expiresAt <= nowMs) return false;
  if (device.connectedToControl === true) return true;

  const lastSeenAt = parseDateMs(device.lastSeen);
  return lastSeenAt != null && nowMs - lastSeenAt <= recentMs;
}

function devicesToProbeHosts(payload, nowMs = Date.now(), recentMs = DEFAULT_RECENT_MS) {
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  const hosts = new Set();
  for (const device of devices) {
    if (!isEligibleComputerDevice(device, nowMs, recentMs)) continue;
    const dnsName = normalizeMagicDnsName(device.name);
    if (dnsName) hosts.add(dnsName);
    for (const rawAddress of Array.isArray(device.addresses) ? device.addresses : []) {
      const address = String(rawAddress || '').split('/')[0].trim();
      if (isTailscaleIpv4(address)) hosts.add(address);
    }
  }
  return Array.from(hosts);
}

function configuredCredentialType(env = process.env) {
  if (env.TAILSCALE_API_ACCESS_TOKEN?.trim()) return 'access_token';
  const clientId = env.TAILSCALE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.TAILSCALE_OAUTH_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return 'oauth_client';
  if (clientId || clientSecret) return 'incomplete_oauth_client';
  return null;
}

function errorForResponse(prefix, response) {
  // Provider error bodies are intentionally ignored: a proxy or upstream can
  // reflect credential-bearing request details. Status is enough to diagnose
  // the optional discovery path without risking a secret in session logs.
  return new Error(`${prefix} (${response.status})`);
}

async function resolveAccessToken(env = process.env, fetchImpl = fetch) {
  const credentialType = configuredCredentialType(env);
  if (!credentialType) return { configured: false, credentialType: null, accessToken: null };
  if (credentialType === 'incomplete_oauth_client') {
    throw new Error('Tailscale OAuth configuration requires both client ID and client secret');
  }
  if (credentialType === 'access_token') {
    return {
      configured: true,
      credentialType,
      accessToken: env.TAILSCALE_API_ACCESS_TOKEN.trim(),
    };
  }

  const clientId = env.TAILSCALE_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.TAILSCALE_OAUTH_CLIENT_SECRET.trim();
  const authorization = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: READ_SCOPE,
    }).toString(),
  });
  if (!response.ok) throw errorForResponse('Tailscale OAuth token exchange failed', response);
  const body = await response.json();
  if (typeof body?.access_token !== 'string' || !body.access_token.trim()) {
    throw new Error('Tailscale OAuth token exchange returned no access token');
  }
  return { configured: true, credentialType, accessToken: body.access_token.trim() };
}

async function discoverTailnetHosts({
  env = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
  recentMs = DEFAULT_RECENT_MS,
} = {}) {
  const auth = await resolveAccessToken(env, fetchImpl);
  if (!auth.configured) {
    return {
      configured: false,
      credentialType: null,
      tailnet: null,
      deviceCount: 0,
      candidateCount: 0,
      hosts: [],
    };
  }

  const tailnet = env.TAILSCALE_TAILNET?.trim() || '-';
  const url = `${API_BASE_URL}/tailnet/${encodeURIComponent(tailnet)}/devices`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!response.ok) throw errorForResponse('Tailscale device inventory failed', response);
  const payload = await response.json();
  const deviceCount = Array.isArray(payload?.devices) ? payload.devices.length : 0;
  const hosts = devicesToProbeHosts(payload, nowMs, recentMs);
  return {
    configured: true,
    credentialType: auth.credentialType,
    tailnet,
    deviceCount,
    candidateCount: hosts.length,
    hosts,
  };
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return message
    .replace(/tskey-[a-z]+-[A-Za-z0-9_-]+/gi, '[redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const hostsOnly = args.has('--hosts-only');
  const result = await discoverTailnetHosts();
  if (hostsOnly) {
    process.stdout.write(`${result.hosts.join(',')}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = {
  API_BASE_URL,
  DEFAULT_RECENT_MS,
  OAUTH_TOKEN_URL,
  READ_SCOPE,
  configuredCredentialType,
  devicesToProbeHosts,
  discoverTailnetHosts,
  isEligibleComputerDevice,
  isTailscaleIpv4,
  normalizeMagicDnsName,
  resolveAccessToken,
  safeErrorMessage,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[hermes-tailscale-api-discover] ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
