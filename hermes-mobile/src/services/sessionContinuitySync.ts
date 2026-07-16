import { PAIR_SERVER_PORT } from './gatewayDiscovery';
import {
  parseHandoffJson,
  type SessionContinuityHandoff,
} from '../utils/sessionContinuityHandoff';

export const SESSION_HANDOFF_PATH = '/session-handoff';
export const SESSION_HANDOFF_JSON_PATH = '/session-handoff.json';
export const SESSION_HANDOFF_TIMEOUT_MS = 3500;

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
    // ignore
  }
  hosts.add('127.0.0.1');
  hosts.add('localhost');
  return [...hosts];
}

export async function postSessionContinuityHandoff(
  gatewayUrl: string,
  handoff: SessionContinuityHandoff,
  extraHosts: string[] = [],
): Promise<boolean> {
  const body = JSON.stringify(handoff);
  for (const host of pairServerHosts(gatewayUrl, extraHosts)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_HANDOFF_TIMEOUT_MS);
    try {
      const response = await fetch(`http://${host}:${PAIR_SERVER_PORT}${SESSION_HANDOFF_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (response.ok) return true;
    } catch {
      // try next host
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

export async function fetchSessionContinuityHandoff(
  gatewayUrl: string,
  extraHosts: string[] = [],
): Promise<SessionContinuityHandoff | null> {
  for (const host of pairServerHosts(gatewayUrl, extraHosts)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_HANDOFF_TIMEOUT_MS);
    try {
      const response = await fetch(
        `http://${host}:${PAIR_SERVER_PORT}${SESSION_HANDOFF_JSON_PATH}`,
        { signal: controller.signal },
      );
      if (!response.ok) continue;
      const json = (await response.json()) as unknown;
      const parsed = parseHandoffJson(json);
      if (parsed) return parsed;
    } catch {
      // try next host
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
