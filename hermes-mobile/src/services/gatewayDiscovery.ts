import NetInfo from '@react-native-community/netinfo';
import { parseSetupDeepLink } from '../utils/setupDeepLink';
import {
  buildGatewayUrlFromLanIp,
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isLoopbackHost,
  isPrivateLanIpv4,
  resolveDisplayLanIp,
} from '../utils/gatewayUrlPolicy';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import {
  buildTailscaleGatewayUrl,
  isTailscaleGatewayUrl,
  mergeTailnetProbeHosts,
} from '../utils/tailscaleHosts';
import { normalizeGatewayUrl } from './gatewayClient';
import { USB_LOOPBACK_GATEWAY_URL } from '../utils/gatewayLoopbackFallback';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanStage } from '../types/lanScan';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const PROBE_TIMEOUT_MS = 1500;
export const PAIR_SERVER_PORT = 8765;
const SUBNET_BATCH_SIZE = 48;

export type DiscoverLanOptions = {
  onProgress?: (progress: LanScanProgress) => void;
  /** Known Tailscale hosts (100.x / MagicDNS) — sweep :8765/pair.json on each. */
  tailnetPairServerHosts?: string[];
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

/** Host for :8765/pair.json given the active gateway URL (USB loopback → 127.0.0.1). */
export function pairServerHostFromGatewayUrl(gatewayUrl: string): string | null {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (isLoopbackGatewayUrl(trimmed)) {
    return '127.0.0.1';
  }
  return extractLanIpFromGatewayUrl(trimmed) || gatewayUrlHostname(trimmed) || null;
}

/** Fetch fresh gateway URL + API key from the Mac pair server (rotated keys). */
export async function resolvePairServerSetupParams(host: string): Promise<SetupDeepLinkParams | null> {
  const payload = await fetchPairServerConfig(host.trim());
  if (!payload?.deepLink?.trim()) {
    return null;
  }
  return parseSetupDeepLink(payload.deepLink);
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
  const httpBase = normalizeGatewayUrl(gatewayUrl).httpBase;
  // Pair servers sometimes stamp the *serving* Mac's LAN IP onto another machine's
  // Tailscale pair.json (e.g. mini URL + MacBook LAN IP). That poisoned localIp merges
  // two computers into one saved profile — drop RFC1918 localIp on Tailscale URLs.
  let localIp = payload.localIp || extractLanIpFromGatewayUrl(gatewayUrl) || undefined;
  if (localIp && isPrivateLanIpv4(localIp) && isTailscaleGatewayUrl(httpBase)) {
    localIp = undefined;
  }
  return {
    gatewayUrl: httpBase,
    hostname: payload.hostname,
    localIp,
    label: payload.hostname?.replace(/\.local$/i, ''),
  };
}

/** One computer identity for scan banners — not one URL alias (loopback/LAN/Tailscale). */
export function discoveredMachineKey(item: DiscoveredGateway): string {
  const host = (item.hostname || item.label || '')
    .trim()
    .toLowerCase()
    .replace(/\.local$/i, '');
  if (host && host !== 'localhost') {
    return `name:${host}`;
  }
  const ip = item.localIp?.trim();
  if (ip && !isLoopbackHost(ip)) {
    return `ip:${ip}`;
  }
  const urlHost = gatewayUrlHostname(item.gatewayUrl)?.toLowerCase() ?? item.gatewayUrl;
  if (urlHost === '127.0.0.1' || urlHost === 'localhost') {
    return 'usb:loopback';
  }
  return `url:${normalizeGatewayUrl(item.gatewayUrl).httpBase}`;
}

function discoveryRouteRank(item: DiscoveredGateway): number {
  if (isTailscaleGatewayUrl(item.gatewayUrl)) {
    return 3;
  }
  if (isLoopbackGatewayUrl(item.gatewayUrl)) {
    return 1;
  }
  return 2;
}

/** Collapse URL aliases so "Found N machines" matches the picker, not every IP/MagicDNS twin. */
export function dedupeDiscoveredGatewaysByMachine(
  gateways: DiscoveredGateway[],
): DiscoveredGateway[] {
  const map = new Map<string, DiscoveredGateway>();
  for (const item of gateways) {
    if (!item?.gatewayUrl) {
      continue;
    }
    const key = discoveredMachineKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const preferNew = discoveryRouteRank(item) > discoveryRouteRank(existing);
    const winner = preferNew ? item : existing;
    const loser = preferNew ? existing : item;
    map.set(key, {
      gatewayUrl: winner.gatewayUrl,
      hostname: winner.hostname || loser.hostname,
      localIp: winner.localIp || loser.localIp,
      label: winner.label || loser.label,
    });
  }
  return Array.from(map.values());
}

export function countUniqueDiscoveredMachines(gateways: DiscoveredGateway[]): number {
  return dedupeDiscoveredGatewaysByMachine(gateways).length;
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

function pairServerSweepHosts(
  phoneIp: string,
  preferLanIp?: string | null,
  tailnetPairServerHosts?: string[],
): string[] {
  const baseHosts = ['127.0.0.1', 'localhost'];
  const subnetHosts = phoneIp ? buildHostOrder(phoneIp, preferLanIp) : [];
  const tailnetHosts = mergeTailnetProbeHosts(tailnetPairServerHosts ?? []);
  return Array.from(new Set([...baseHosts, ...subnetHosts, ...tailnetHosts]));
}

async function sweepTailnetGatewayHealth(
  tailnetProbeHosts: string[],
): Promise<DiscoveredGateway[]> {
  const hosts = mergeTailnetProbeHosts(tailnetProbeHosts);
  if (hosts.length === 0) {
    return [];
  }
  const probes = await Promise.all(
    hosts.map(async (host) => probeGatewayDetailed(buildTailscaleGatewayUrl(host))),
  );
  return probes.filter((item): item is DiscoveredGateway => item != null);
}

/** USB loopback + optional tailnet :8765 sweep — seeds tailnetProbeHosts on fresh install. */
export async function bootstrapTailnetProbeHostsFromPairServers(
  candidateHosts: string[] = [],
): Promise<{ tailnetProbeHosts: string[]; gateways: DiscoveredGateway[] }> {
  const hosts = pairServerSweepHosts('', null, candidateHosts);
  const map = new Map<string, DiscoveredGateway>();
  let tailnetProbeHosts: string[] = [];
  for (const host of hosts) {
    const payload = await fetchPairServerConfig(host);
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
  if (tailnetProbeHosts.length > 0) {
    for (const item of await sweepTailnetGatewayHealth(tailnetProbeHosts)) {
      mergeDiscovered(map, item);
    }
  }
  return { tailnetProbeHosts, gateways: Array.from(map.values()) };
}

async function sweepAllPairServers(
  phoneIp: string,
  preferLanIp?: string | null,
  options?: DiscoverLanOptions,
): Promise<{ gateways: DiscoveredGateway[]; tailnetProbeHosts: string[] }> {
  const hosts = pairServerSweepHosts(phoneIp, preferLanIp, options?.tailnetPairServerHosts);
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

  if (fromPair.tailnetProbeHosts.length > 0) {
    for (const item of await sweepTailnetGatewayHealth(fromPair.tailnetProbeHosts)) {
      mergeDiscovered(map, item);
    }
  }

  const list = dedupeDiscoveredGatewaysByMachine(Array.from(map.values()));
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

/** Probe adb-reverse USB loopback — reachable only when phone is cabled to a Mac with reverse active. */
export async function probeLiveUsbGateway(): Promise<DiscoveredGateway | null> {
  return probeGatewayDetailed(USB_LOOPBACK_GATEWAY_URL);
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
