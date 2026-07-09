import type {
  GatewayEventMessage,
  GatewayHealthLevel,
  GatewayHealthSnapshot,
  GateBlockedPayload,
  PendingApproval,
  ReclaimFiredPayload,
} from '../types/gateway';
import { resolveDisplayLanIp } from '../utils/gatewayUrlPolicy';

export interface NormalizedGatewayBase {
  httpBase: string;
  wsBase: string;
}

/** Strip /v1, /health paths so callers can paste tunnel URLs flexibly. */
export function normalizeGatewayUrl(input: string): NormalizedGatewayBase {
  let trimmed = input.trim().replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/health\/detailed$/, '');
  trimmed = trimmed.replace(/\/health$/, '');
  trimmed = trimmed.replace(/\/v1$/, '');
  trimmed = trimmed.replace(/\/+$/, '');

  if (!/^[a-zA-Z]+:\/\//.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  const wsBase = trimmed.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return { httpBase: trimmed, wsBase };
}

export function buildAuthHeaders(apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

export const GATEWAY_WRONG_KEY_MESSAGE = 'Wrong key for this computer';

export type GatewayAuthProbeResult = {
  ok: boolean;
  status?: number;
  errorMessage?: string;
};

/** Lightweight authenticated probe — catches /health=200 + chat=401 wrong-key class. */
export async function probeGatewayAuth(
  gatewayUrl: string,
  apiKey?: string | null,
  timeoutMs = 5000,
): Promise<GatewayAuthProbeResult> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return { ok: true };
  }
  const { httpBase } = normalizeGatewayUrl(gatewayUrl);
  const url = `${httpBase}/api/sessions?limit=1`;
  try {
    const response = await fetchWithTimeout(url, { headers: buildAuthHeaders(trimmed) }, timeoutMs);
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        errorMessage: GATEWAY_WRONG_KEY_MESSAGE,
      };
    }
    return { ok: true, status: response.status };
  } catch {
    return { ok: true };
  }
}

function classifyHealth(body: Record<string, unknown>, errorMessage?: string): GatewayHealthLevel {
  if (errorMessage) {
    return 'red';
  }
  const status = String(body.status ?? '').toLowerCase();
  const gatewayState = String(body.gateway_state ?? '').toLowerCase();
  if (status === 'ok') {
    if (!gatewayState || gatewayState === 'running') {
      return 'green';
    }
    return 'amber';
  }
  if (gatewayState === 'running') {
    return 'amber';
  }
  return 'red';
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function fetchGatewayHealth(
  gatewayUrl: string,
  apiKey?: string | null,
  timeoutMs = 15000,
): Promise<GatewayHealthSnapshot> {
  const { httpBase } = normalizeGatewayUrl(gatewayUrl);
  const headers = buildAuthHeaders(apiKey);
  const checkedAt = new Date().toISOString();

  const detailedUrl = `${httpBase}/health/detailed`;
  const simpleUrl = `${httpBase}/health`;

  try {
    let response = await fetchWithTimeout(detailedUrl, { headers }, timeoutMs);
    if (!response.ok) {
      response = await fetchWithTimeout(simpleUrl, { headers }, timeoutMs);
    }
    if (!response.ok) {
      return {
        level: 'red',
        checkedAt,
        errorMessage: `HTTP ${response.status} from gateway health probe`,
      };
    }
    const body = (await response.json()) as Record<string, unknown>;
    const localIpRaw = typeof body.local_ip === 'string' ? body.local_ip : undefined;
    const level = classifyHealth(body);
    let directGatewayReachable = level === 'green' || level === 'amber';
    let authMismatch = false;
    let authErrorMessage: string | undefined;
    if (directGatewayReachable && apiKey?.trim()) {
      const auth = await probeGatewayAuth(gatewayUrl, apiKey, timeoutMs);
      if (!auth.ok) {
        directGatewayReachable = false;
        authMismatch = true;
        authErrorMessage = auth.errorMessage;
      }
    }
    return {
      level,
      status: typeof body.status === 'string' ? body.status : undefined,
      gatewayState: typeof body.gateway_state === 'string' ? body.gateway_state : undefined,
      pid: typeof body.pid === 'number' ? body.pid : undefined,
      platforms: body.platforms as GatewayHealthSnapshot['platforms'],
      checkedAt,
      hostname: typeof body.hostname === 'string' ? body.hostname : undefined,
      localIp: resolveDisplayLanIp(localIpRaw, httpBase),
      directGatewayReachable,
      authMismatch: authMismatch || undefined,
      errorMessage: authMismatch ? authErrorMessage : undefined,
    };
  } catch (error) {
    return {
      level: 'red',
      checkedAt,
      errorMessage: error instanceof Error ? error.message : 'Gateway health probe failed',
    };
  }
}

export function parseGatewayEvent(raw: string): GatewayEventMessage | null {
  try {
    const parsed = JSON.parse(raw) as GatewayEventMessage;
    if (!parsed?.event) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function gateBlockedToPending(event: GatewayEventMessage): PendingApproval | null {
  if (event.event !== 'GATE.BLOCKED' || !event.payload) {
    return null;
  }
  const payload = event.payload as unknown as GateBlockedPayload;
  if (!payload.actionId || !payload.toolName || !payload.reason) {
    return null;
  }
  return {
    actionId: payload.actionId,
    toolName: payload.toolName,
    reason: payload.reason,
    command: payload.command,
    workspacePath: payload.workspacePath,
    diff: payload.diff,
    runId: payload.runId,
    allowPermanent: payload.allowPermanent,
    source: payload.source,
    approveText: payload.approveText,
    riskTier: payload.riskTier,
    rollbackHint: payload.rollbackHint,
    sessionKey: payload.sessionKey,
    receivedAt: event.timestamp ?? new Date().toISOString(),
  };
}

export function parseReclaimEvent(event: GatewayEventMessage): ReclaimFiredPayload | null {
  if (event.event !== 'RECLAIM.FIRED' || !event.payload) {
    return null;
  }
  const payload = event.payload as unknown as ReclaimFiredPayload;
  if (!payload.target) {
    return null;
  }
  return payload;
}

export function buildGateActionMessage(
  actionId: string,
  decision: 'approve' | 'reject',
  operatorNote?: string,
  choice?: 'once' | 'session' | 'always' | 'deny',
  source?: 'gateway_guard' | 'text_nudge' | 'relay_hook',
): GatewayEventMessage {
  const payload: Record<string, string> = {
    actionId,
    decision,
    operatorNote: operatorNote ?? `Decision ${decision} from Hermes Mobile`,
  };
  if (choice) {
    payload.choice = choice;
  }
  if (source) {
    payload.source = source;
  }
  return {
    event: 'GATE.ACTION',
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildEventsWebSocketUrl(gatewayUrl: string): string {
  const { wsBase } = normalizeGatewayUrl(gatewayUrl);
  return `${wsBase}/v1/events`;
}

/** Demo event for UI development when gateway WS is unavailable. */
export function buildDemoGateBlockedEvent(): GatewayEventMessage {
  return {
    event: 'GATE.BLOCKED',
    timestamp: new Date().toISOString(),
    payload: {
      actionId: `demo_${Date.now()}`,
      toolName: 'run_command',
      reason: 'Pre-action rule blocked execution to prevent memory runaway.',
      command: 'node tests/test-runaway.js --force-leak',
      workspacePath: '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
      diff: '--- a/sim-runaway-guard.sh\n+++ b/sim-runaway-guard.sh\n@@ -124,1 +124,2 @@\n-  if [ "$mem_pct" -lt 10 ]\n+  local min_pct=${YOLO_MEM_FREE_PCT_THRESHOLD:-15}',
    },
  };
}
