import NetInfo from '@react-native-community/netinfo';
import { parseSetupDeepLink } from '../utils/setupDeepLink';
import { buildGatewayUrlFromLanIp, extractLanIpFromGatewayUrl, resolveDisplayLanIp } from '../utils/gatewayUrlPolicy';
import { mergeTailnetProbeHosts } from '../utils/tailscaleHosts';
import { normalizeGatewayUrl } from './gatewayClient';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanStage } from '../types/lanScan';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const PROBE_TIMEOUT_MS = 1500;
const PAIR_SERVER_PORT = 8765;
const SUBNET_BATCH_SIZE = 48;

export type DiscoverLanOptions = {
  onProgress?: (progress: LanScanProgress) => void;
};

function reportLanScanProgress(
  onProgress: DiscoverLanOptions['onProgress'],
  stage: LanScanStage,
  completedHosts: number,
  totalHosts: number,
  foundCount: number,
) {
  onProgress?.({ stage, completedHosts, totalHosts, foundCount });
}

export type PairServerPayload = {
  gatewayUrl: string;
  deepLink: string;
  qrUrl?: string;
  hostname?: string;
  localIp?: string;
  relayCode?: string;
  tailnetProbeHosts?: string[];
};

export type DiscoverAllGatewaysOnLanResult = {
  gateways: DiscoveredGateway[];
  tailnetProbeHosts: string[];
};

async function getPhoneLanIp(): Promise<string | null> {
  const state = await NetInfo.fetch();
  const raw = (state.details as { ipAddress?: string } | null)?.ipAddress;
  if (!raw?.trim() || !IPV4_RE.test(raw.trim())) {
    return null;
  }
  return raw.trim();
}

async function probeGatewayHealth(url: string): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) {
      return false;
    }
    const body = await res.json();
    return body?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

async function fetchPairServerConfig(host: string): Promise<PairServerPayload | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${host}:${PAIR_SERVER_PORT}/pair.json`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as Partial<PairServerPayload>;
    if (!body.gatewayUrl?.trim()) {
      return null;
    }
    const tailnetProbeHosts = Array.isArray(body.tailnetProbeHosts)
      ? body.tailnetProbeHosts.filter((host): host is string => typeof host === 'string')
      : undefined;
    return {
      gatewayUrl: body.gatewayUrl.trim(),
      deepLink: body.deepLink?.trim() ?? '',
      qrUrl: body.qrUrl,
      hostname: body.hostname,
      localIp: body.localIp,
      relayCode: typeof body.relayCode === 'string' ? body.relayCode : undefined,
      tailnetProbeHosts,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

export async function resolvePairServerMachineName(host: string): Promise<string | null> {
  const payload = await fetchPairServerConfig(host);
  if (!payload) {
    return null;
  }
  const fromHostname = payload.hostname?.trim().replace(/\.local$/i, '');
  if (fromHostname) {
    return fromHostname;
  }
  if (payload.deepLink) {
    const parsed = parseSetupDeepLink(payload.deepLink);
    const macName = parsed?.macName?.trim();
    if (macName) {
      return macName.replace(/\.local$/i, '');
    }
  }
  return null;
}

export async function resolvePairServerRelayCode(host: string): Promise<string | null> {
  const payload = await fetchPairServerConfig(host);
  const code = payload?.relayCode?.trim();
  return code ? code.toUpperCase() : null;
}

function pairPayloadToGatewayUrl(payload: PairServerPayload): string | null {
  if (payload.deepLink) {
    const parsed = parseSetupDeepLink(payload.deepLink);
    if (parsed?.gatewayUrl) {
      return parsed.gatewayUrl;
    }
  }
  return payload.gatewayUrl;
}

function buildHostOrder(phoneIp: string, preferLanIp?: string | null): string[] {
  const parts = phoneIp.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return [];
  }

  const [a, b, c, self] = parts;
  const hostNumbers: number[] = [];
  if (preferLanIp && IPV4_RE.test(preferLanIp.trim())) {
    const preferParts = preferLanIp.trim().split('.').map((p) => Number(p));
    if (
      preferParts.length === 4 &&
      preferParts[0] === a &&
      preferParts[1] === b &&
      preferParts[2] === c &&
      preferParts[3] !== self
    ) {
      hostNumbers.push(preferParts[3]);
    }
  }
  for (let host = 1; host <= 254; host += 1) {
    if (host !== self && !hostNumbers.includes(host)) {
      hostNumbers.push(host);
    }
  }
  return hostNumbers.map((host) => `${a}.${b}.${c}.${host}`);
}

async function probeGatewayDetailed(url: string): Promise<DiscoveredGateway | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    if (body?.status !== 'ok') {
      return null;
    }
    const httpBase = normalizeGatewayUrl(url).httpBase;
    const reportedIp =
      typeof body.local_ip === 'string' ? body.local_ip : undefined;
    return {
      gatewayUrl: httpBase,
      hostname: typeof body.hostname === 'string' ? body.hostname : undefined,
      localIp: resolveDisplayLanIp(reportedIp, httpBase) ?? undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function pairPayloadToDiscovered(payload: PairServerPayload): DiscoveredGateway | null {
  const gatewayUrl = pairPayloadToGatewayUrl(payload);
  if (!gatewayUrl) {
    return null;
  }
  return {
    gatewayUrl: normalizeGatewayUrl(gatewayUrl).httpBase,
    hostname: payload.hostname,
    localIp: payload.localIp || extractLanIpFromGatewayUrl(gatewayUrl) || undefined,
    label: payload.hostname?.replace(/\.local$/i, ''),
  };
}

function mergeDiscovered(map: Map<string, DiscoveredGateway>, item: DiscoveredGateway | null) {
  if (!item?.gatewayUrl) {
    return;
  }
  const key = normalizeGatewayUrl(item.gatewayUrl).httpBase;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, item);
    return;
  }
  map.set(key, {
    gatewayUrl: key,
    hostname: item.hostname || existing.hostname,
    localIp: item.localIp || existing.localIp,
    label: item.label || existing.label,
  });
}

async function sweepAllPairServers(
  phoneIp: string,
  preferLanIp?: string | null,
  options?: DiscoverLanOptions,
): Promise<{ gateways: DiscoveredGateway[]; tailnetProbeHosts: string[] }> {
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const hosts = [...baseHosts, ...subnetHosts];
  const map = new Map<string, DiscoveredGateway>();
  let tailnetProbeHosts: string[] = [];
  if (hosts.length === 0) {
    return { gateways: [], tailnetProbeHosts: [] };
  }

  for (let start = 0; start < hosts.length; start += SUBNET_BATCH_SIZE) {
    const batch = hosts.slice(start, start + SUBNET_BATCH_SIZE);
    const probes = batch.map(async (host) => {
      const payload = await fetchPairServerConfig(host);
      return payload;
    });
    const results = await Promise.all(probes);
    for (const payload of results) {
      if (!payload) {
        continue;
      }
      if (payload.tailnetProbeHosts?.length) {
        tailnetProbeHosts = mergeTailnetProbeHosts(
          tailnetProbeHosts,
          payload.tailnetProbeHosts,
        );
      }
      mergeDiscovered(map, pairPayloadToDiscovered(payload));
    }
    reportLanScanProgress(
      options?.onProgress,
      'pair_server',
      Math.min(start + batch.length, hosts.length),
      hosts.length,
      map.size,
    );
  }

  return { gateways: Array.from(map.values()), tailnetProbeHosts };
}

async function sweepAllGateways(
  phoneIp: string,
  preferLanIp?: string | null,
  options?: DiscoverLanOptions,
  foundSoFar = 0,
): Promise<DiscoveredGateway[]> {
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const hosts = [...baseHosts, ...subnetHosts];
  const map = new Map<string, DiscoveredGateway>();
  if (hosts.length === 0) {
    return [];
  }

  for (let start = 0; start < hosts.length; start += SUBNET_BATCH_SIZE) {
    const batch = hosts.slice(start, start + SUBNET_BATCH_SIZE);
    const probes = batch.map(async (host) => {
      const url = buildGatewayUrlFromLanIp(host);
      return probeGatewayDetailed(url);
    });
    const results = await Promise.all(probes);
    for (const item of results) {
      mergeDiscovered(map, item);
    }
    reportLanScanProgress(
      options?.onProgress,
      'gateway_health',
      Math.min(start + batch.length, hosts.length),
      hosts.length,
      foundSoFar + map.size,
    );
  }

  return Array.from(map.values());
}

/** Find every Hermes Mac on the LAN (pair server + gateway health sweep). */
export async function discoverAllGatewaysOnLan(
  preferLanIp?: string | null,
  options?: DiscoverLanOptions,
): Promise<DiscoverAllGatewaysOnLanResult> {
  const phoneIp = await getPhoneLanIp();
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const hosts = [...baseHosts, ...subnetHosts];

  reportLanScanProgress(options?.onProgress, 'pair_server', 0, hosts.length, 0);

  const map = new Map<string, DiscoveredGateway>();
  const fromPair = await sweepAllPairServers(phoneIp ?? '', preferLanIp, options);
  for (const item of fromPair.gateways) {
    mergeDiscovered(map, item);
  }
  const fromHealth = await sweepAllGateways(phoneIp ?? '', preferLanIp, options, map.size);
  for (const item of fromHealth) {
    mergeDiscovered(map, item);
  }

  const list = Array.from(map.values());
  reportLanScanProgress(options?.onProgress, 'complete', hosts.length, hosts.length, list.length);
  if (preferLanIp && IPV4_RE.test(preferLanIp.trim())) {
    const preferUrl = buildGatewayUrlFromLanIp(preferLanIp.trim());
    const preferKey = normalizeGatewayUrl(preferUrl).httpBase;
    list.sort((a, b) => {
      const aKey = normalizeGatewayUrl(a.gatewayUrl).httpBase;
      const bKey = normalizeGatewayUrl(b.gatewayUrl).httpBase;
      if (aKey === preferKey) return -1;
      if (bKey === preferKey) return 1;
      return a.label?.localeCompare(b.label ?? '') ?? 0;
    });
  }
  return { gateways: list, tailnetProbeHosts: fromPair.tailnetProbeHosts };
}

async function sweepSubnetForPairServer(
  phoneIp: string,
  preferLanIp?: string | null,
): Promise<string | null> {
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const hosts = [...baseHosts, ...subnetHosts];
  if (hosts.length === 0) {
    return null;
  }

  for (let start = 0; start < hosts.length; start += SUBNET_BATCH_SIZE) {
    const batch = hosts.slice(start, start + SUBNET_BATCH_SIZE);
    const probes = batch.map(async (host) => {
      const payload = await fetchPairServerConfig(host);
      return payload ? pairPayloadToGatewayUrl(payload) : null;
    });
    const results = await Promise.all(probes);
    const found = results.find((url) => url);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Prefer Mac pair server (QR page) — faster than sweeping every gateway port.
 */
export async function discoverGatewayViaPairServer(
  preferLanIp?: string | null,
): Promise<string | null> {
  const phoneIp = await getPhoneLanIp();
  return sweepSubnetForPairServer(phoneIp ?? '', preferLanIp);
}

/**
 * Sweep the phone's Wi‑Fi subnet for a Hermes gateway.
 */
export async function discoverGatewayOnPhoneSubnet(
  preferLanIp?: string | null,
): Promise<string | null> {
  const phoneIp = await getPhoneLanIp();
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const hosts = [...baseHosts, ...subnetHosts];
  if (hosts.length === 0) {
    return null;
  }

  for (let start = 0; start < hosts.length; start += SUBNET_BATCH_SIZE) {
    const batch = hosts.slice(start, start + SUBNET_BATCH_SIZE);
    const probes = batch.map(async (host) => {
      const url = buildGatewayUrlFromLanIp(host);
      const ok = await probeGatewayHealth(url);
      return ok ? url : null;
    });
    const results = await Promise.all(probes);
    const found = results.find((url) => url);
    if (found) {
      return found;
    }
  }

  return null;
}
