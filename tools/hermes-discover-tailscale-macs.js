#!/usr/bin/env node
'use strict';

/**
 * Probe Tailscale peers for Hermes gateway :8642/health.
 *
 * Usage:
 *   node tools/hermes-discover-tailscale-macs.js [--json] [--hosts 100.x.x.x,...]
 *
 * Without --hosts, reads online peer IPs from `tailscale status --json` when available.
 */

const { spawnSync } = require('child_process');
const os = require('os');

const GATEWAY_PORT = 8642;
const PROBE_TIMEOUT_MS = 2500;

function resolveTailscaleBinary() {
  const candidates = [
    process.env.TAILSCALE_BIN,
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/usr/local/bin/tailscale',
    '/opt/homebrew/bin/tailscale',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['version'], { encoding: 'utf8', timeout: 4000 });
    if (check.status === 0) {
      return candidate;
    }
  }
  const which = spawnSync('which', ['tailscale'], { encoding: 'utf8', timeout: 4000 });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }
  return null;
}

function isTailscaleIpv4(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

function isTailscaleHost(host) {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return false;
  if (isTailscaleIpv4(trimmed)) return true;
  return trimmed.endsWith('.ts.net');
}

function localTailscaleIpv4() {
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const info of entries || []) {
      if (info.family === 'IPv4' && !info.internal && isTailscaleIpv4(info.address)) {
        return info.address;
      }
    }
  }
  return null;
}

function isPeerOnline(peer) {
  return peer.Online !== false && peer.online !== false;
}

function isMobilePeer(peer) {
  const peerOs = String(peer.OS || peer.os || '').toLowerCase();
  const dnsName = String(peer.DNSName || peer.HostName || '').toLowerCase();
  return peerOs === 'android' || peerOs === 'ios' || /s25|iphone|ipad|pixel|galaxy/.test(dnsName);
}

function peerHostsFromStatusJson(json) {
  const peers = json.Peer || json.Peers || {};
  const hosts = new Set();
  for (const peer of Object.values(peers)) {
    if (!isPeerOnline(peer) || isMobilePeer(peer)) {
      continue;
    }
    const ips = [];
    if (Array.isArray(peer.TailscaleIPs)) ips.push(...peer.TailscaleIPs);
    if (Array.isArray(peer.Addresses)) ips.push(...peer.Addresses);
    if (typeof peer.TailscaleIP === 'string') ips.push(peer.TailscaleIP);
    for (const ip of ips) {
      if (typeof ip === 'string' && isTailscaleIpv4(ip.split('/')[0])) {
        hosts.add(ip.split('/')[0]);
      }
    }
    const dns = peer.DNSName || peer.HostName;
    if (typeof dns === 'string') {
      const cleaned = dns.replace(/\.$/, '');
      if (cleaned.endsWith('.ts.net')) {
        hosts.add(cleaned);
      }
    }
  }
  // Include Self: the Mac running discovery is itself a Hermes gateway candidate.
  // Excluding it meant pair links generated on the MacBook Pro only ever seeded
  // the mini, so the phone picker never showed the MBP (T-222).
  const self = json.Self || {};
  if (!isMobilePeer(self)) {
    const selfIps = self.TailscaleIPs || json.TailscaleIPs || [];
    for (const ip of selfIps) {
      if (typeof ip === 'string' && isTailscaleIpv4(ip.split('/')[0])) {
        hosts.add(ip.split('/')[0]);
      }
    }
    const selfDns = self.DNSName || self.HostName;
    if (typeof selfDns === 'string') {
      const cleaned = selfDns.replace(/\.$/, '');
      if (cleaned.endsWith('.ts.net')) {
        hosts.add(cleaned);
      }
    }
  }
  return Array.from(hosts);
}

function fetchTailscalePeerHosts() {
  const tailscaleBin = resolveTailscaleBinary();
  if (!tailscaleBin) {
    return [];
  }
  const result = spawnSync(tailscaleBin, ['status', '--json'], {
    encoding: 'utf8',
    timeout: 8000,
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    return [];
  }
  try {
    return peerHostsFromStatusJson(JSON.parse(result.stdout));
  } catch {
    return [];
  }
}

function probeHealth(host) {
  const hostOnly = host.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  const url = `http://${hostOnly}:${GATEWAY_PORT}`;
  const result = spawnSync(
    'curl',
    ['-sf', '--max-time', String(Math.ceil(PROBE_TIMEOUT_MS / 1000)), `${url}/health`],
    { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS + 500 },
  );
  if (result.status !== 0 || !result.stdout?.trim()) {
    return null;
  }
  try {
    const body = JSON.parse(result.stdout);
    if (body.status !== 'ok') {
      return null;
    }
    const hostname = typeof body.hostname === 'string' ? body.hostname : undefined;
    if (hostname && /android|iphone|ipad/i.test(hostname)) {
      return null;
    }
    const localIp =
      typeof body.local_ip === 'string'
        ? body.local_ip
        : typeof body.localIp === 'string'
          ? body.localIp
          : undefined;
    const label = hostname?.replace(/\.local$/i, '') || hostOnly;
    return {
      gatewayUrl: url,
      hostname,
      localIp,
      label,
      host: hostOnly,
      hermesVersion: body.hermes_version || body.version || undefined,
    };
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = new Set(argv);
  const json = args.has('--json');
  let hosts = [];
  const envHosts = process.env.HERMES_TAILNET_PROBE_HOSTS || process.env.TAILNET_PROBE_HOSTS;
  if (envHosts?.trim()) {
    hosts.push(
      ...envHosts
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
    );
  }
  const hostsIdx = argv.indexOf('--hosts');
  if (hostsIdx >= 0 && argv[hostsIdx + 1]) {
    hosts.push(
      ...argv[hostsIdx + 1]
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
    );
  }
  return { json, hosts };
}

function main() {
  const { json, hosts: cliHosts } = parseArgs(process.argv.slice(2));
  const peerHosts = cliHosts.length > 0 ? cliHosts : fetchTailscalePeerHosts();
  const normalized = [...new Set(peerHosts.filter(isTailscaleHost))];
  const discoveries = [];
  for (const host of normalized) {
    const hit = probeHealth(host);
    if (hit) {
      discoveries.push(hit);
    }
  }
  const payload = {
    localTailscaleIp: localTailscaleIpv4(),
    probedHosts: normalized,
    discoveries,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  console.log('Hermes Tailscale discovery');
  console.log('  Local tailnet IP:', payload.localTailscaleIp || '(none)');
  console.log('  Probed hosts:', normalized.length ? normalized.join(', ') : '(none)');
  if (discoveries.length === 0) {
    console.log('  No Hermes gateways found on tailnet (:8642/health).');
    return;
  }
  for (const item of discoveries) {
    console.log(`  ✓ ${item.label} → ${item.gatewayUrl}`);
    if (item.localIp) console.log(`    LAN ${item.localIp}`);
    if (item.hermesVersion) console.log(`    Hermes ${item.hermesVersion}`);
  }
}

module.exports = {
  isTailscaleIpv4,
  isPeerOnline,
  isMobilePeer,
  peerHostsFromStatusJson,
  localTailscaleIpv4,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[hermes-discover-tailscale-macs] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
