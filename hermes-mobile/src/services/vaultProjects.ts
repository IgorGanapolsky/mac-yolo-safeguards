import AsyncStorage from '@react-native-async-storage/async-storage';
import { PAIR_SERVER_PORT } from './gatewayDiscovery';
import { buildAuthHeaders, normalizeGatewayUrl } from './gatewayClient';
import { getObsidianProjects } from './hermesGatewayClient';
import type { VaultProjectCatalog } from '../types/vaultProject';
import {
  catalogFromGatewayApiProjects,
  catalogFromObsidianProjects,
  normalizeVaultProjectCatalog,
} from '../utils/vaultProjectCatalog';

export const VAULT_PROJECTS_PATH = '/vault-projects.json';
export const VAULT_PROJECTS_FETCH_TIMEOUT_MS = 3500;
const CACHE_KEY_PREFIX = 'hermes-mobile:vault_projects_catalog:';

export type VaultCatalogFetchSource = 'live' | 'cache' | 'none';

function cacheKey(computerProfileId?: string | null): string {
  const profile = computerProfileId?.trim() || 'default';
  return `${CACHE_KEY_PREFIX}${profile}`;
}

export async function loadCachedVaultProjectCatalog(
  computerProfileId?: string | null,
): Promise<VaultProjectCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(computerProfileId));
    if (!raw) return null;
    return normalizeVaultProjectCatalog(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function saveCachedVaultProjectCatalog(
  catalog: VaultProjectCatalog,
  computerProfileId?: string | null,
): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(computerProfileId), JSON.stringify(catalog));
  } catch (error) {
    console.error('[hermes-mobile] saveCachedVaultProjectCatalog failed:', error);
  }
}

function pairServerHosts(gatewayUrl: string, extraHosts: string[] = []): string[] {
  const hosts = new Set<string>();
  for (const host of extraHosts) {
    const trimmed = host.trim();
    if (trimmed) hosts.add(trimmed);
  }
  try {
    const parsed = new URL(gatewayUrl);
    if (parsed.hostname) hosts.add(parsed.hostname);
  } catch {
    // ignore malformed gateway URLs
  }
  hosts.add('127.0.0.1');
  hosts.add('localhost');
  return [...hosts];
}

export async function fetchVaultProjectCatalogFromHost(
  host: string,
  timeoutMs = VAULT_PROJECTS_FETCH_TIMEOUT_MS,
): Promise<VaultProjectCatalog | null> {
  const trimmed = host.trim();
  if (!trimmed) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${trimmed}:${PAIR_SERVER_PORT}${VAULT_PROJECTS_PATH}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return normalizeVaultProjectCatalog(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchVaultProjectCatalogFromGateway(
  gatewayUrl: string,
  apiKey?: string | null,
  timeoutMs = VAULT_PROJECTS_FETCH_TIMEOUT_MS,
): Promise<VaultProjectCatalog | null> {
  const trimmedKey = apiKey?.trim();
  if (!gatewayUrl.trim() || !trimmedKey) return null;
  const { httpBase } = normalizeGatewayUrl(gatewayUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${httpBase}/api/projects`, {
      headers: buildAuthHeaders(trimmedKey),
      signal: controller.signal,
    });
    if (response.ok) {
      const body = (await response.json()) as unknown;
      const catalog = catalogFromGatewayApiProjects(body);
      if (catalog) return catalog;
    }
  } catch {
    // fall through to obsidian route
  } finally {
    clearTimeout(timer);
  }

  try {
    const obsidianProjects = await getObsidianProjects(gatewayUrl, trimmedKey);
    return catalogFromObsidianProjects(obsidianProjects);
  } catch {
    return null;
  }
}

export async function fetchVaultProjectCatalog(
  gatewayUrl: string,
  extraHosts: string[] = [],
  apiKey?: string | null,
): Promise<VaultProjectCatalog | null> {
  const fromGateway = await fetchVaultProjectCatalogFromGateway(gatewayUrl, apiKey);
  if (fromGateway) return fromGateway;
  for (const host of pairServerHosts(gatewayUrl, extraHosts)) {
    const catalog = await fetchVaultProjectCatalogFromHost(host);
    if (catalog) return catalog;
  }
  return null;
}

/** Live gateway (Tailscale/cellular) or pair-server fetch with AsyncStorage fallback. */
export async function fetchVaultProjectCatalogWithCache(
  gatewayUrl: string,
  extraHosts: string[] = [],
  computerProfileId?: string | null,
  apiKey?: string | null,
): Promise<{ catalog: VaultProjectCatalog | null; source: VaultCatalogFetchSource }> {
  const live = await fetchVaultProjectCatalog(gatewayUrl, extraHosts, apiKey);
  if (live) {
    await saveCachedVaultProjectCatalog(live, computerProfileId);
    return { catalog: live, source: 'live' };
  }
  const cached = await loadCachedVaultProjectCatalog(computerProfileId);
  return { catalog: cached, source: cached ? 'cache' : 'none' };
}

export { PAIR_SERVER_PORT };
