import { PAIR_SERVER_PORT } from './gatewayDiscovery';
import type { VaultProjectCatalog } from '../types/vaultProject';
import { normalizeVaultProjectCatalog } from '../utils/vaultProjectCatalog';

export const VAULT_PROJECTS_PATH = '/vault-projects.json';
export const VAULT_PROJECTS_FETCH_TIMEOUT_MS = 3500;

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

export async function fetchVaultProjectCatalog(
  gatewayUrl: string,
  extraHosts: string[] = [],
): Promise<VaultProjectCatalog | null> {
  for (const host of pairServerHosts(gatewayUrl, extraHosts)) {
    const catalog = await fetchVaultProjectCatalogFromHost(host);
    if (catalog) return catalog;
  }
  return null;
}

export { PAIR_SERVER_PORT };
