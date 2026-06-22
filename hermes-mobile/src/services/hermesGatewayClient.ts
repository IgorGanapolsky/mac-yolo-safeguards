import { buildAuthHeaders, normalizeGatewayUrl } from './gatewayClient';
import type {
  HermesCapabilities,
  HermesCronJob,
  HermesSkill,
  HermesToolset,
  ChatStreamEvent,
} from '../types/gatewayApi';

export class HermesGatewayApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function base(gatewayUrl: string): string {
  return normalizeGatewayUrl(gatewayUrl).httpBase;
}

function jsonHeaders(apiKey?: string | null): Record<string, string> {
  return {
    ...buildAuthHeaders(apiKey),
    'Content-Type': 'application/json',
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getCapabilities(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<HermesCapabilities> {
  const response = await fetch(`${base(gatewayUrl)}/v1/capabilities`, {
    headers: buildAuthHeaders(apiKey),
  });
  return parseJson<HermesCapabilities>(response);
}

export async function listSkills(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<HermesSkill[]> {
  const response = await fetch(`${base(gatewayUrl)}/v1/skills`, {
    headers: buildAuthHeaders(apiKey),
  });
  const body = await parseJson<{ data?: HermesSkill[] }>(response);
  return body.data ?? [];
}

export async function listToolsets(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<HermesToolset[]> {
  const response = await fetch(`${base(gatewayUrl)}/v1/toolsets`, {
    headers: buildAuthHeaders(apiKey),
  });
  const body = await parseJson<{ data?: HermesToolset[] }>(response);
  return body.data ?? [];
}

export async function setToolsetEnabled(
  gatewayUrl: string,
  name: string,
  enabled: boolean,
  apiKey?: string | null,
): Promise<{ ok: boolean; name: string; enabled: boolean }> {
  const response = await fetch(
    `${base(gatewayUrl)}/v1/toolsets/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ enabled }),
    },
  );
  return parseJson<{ ok: boolean; name: string; enabled: boolean }>(response);
}

export async function listJobs(
  gatewayUrl: string,
  apiKey?: string | null,
  includeDisabled = true,
): Promise<HermesCronJob[]> {
  const qs = includeDisabled ? '?include_disabled=true' : '';
  const response = await fetch(`${base(gatewayUrl)}/api/jobs${qs}`, {
    headers: buildAuthHeaders(apiKey),
  });
  const body = await parseJson<{ jobs?: HermesCronJob[] }>(response);
  return body.jobs ?? [];
}

export async function pauseJob(
  gatewayUrl: string,
  jobId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export async function resumeJob(
  gatewayUrl: string,
  jobId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export async function runJobNow(
  gatewayUrl: string,
  jobId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/jobs/${encodeURIComponent(jobId)}/run`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export async function deleteSession(
  gatewayUrl: string,
  sessionId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export async function forkSession(
  gatewayUrl: string,
  sessionId: string,
  apiKey?: string | null,
): Promise<{ session_id?: string }> {
  const response = await fetch(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/fork`,
    { method: 'POST', headers: jsonHeaders(apiKey), body: '{}' },
  );
  return parseJson<{ session_id?: string }>(response);
}

export async function stopRun(
  gatewayUrl: string,
  runId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export async function submitRunApproval(
  gatewayUrl: string,
  runId: string,
  choice: 'once' | 'session' | 'always' | 'deny',
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(
    `${base(gatewayUrl)}/v1/runs/${encodeURIComponent(runId)}/approval`,
    {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ choice }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
}

export function parseSseChunk(buffer: string): { events: ChatStreamEvent[]; remainder: string } {
  const events: ChatStreamEvent[] = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';
  for (const part of parts) {
    if (!part.trim() || part.startsWith(':')) continue;
    let eventName = 'message';
    let dataStr = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    if (!dataStr) continue;
    try {
      events.push({ event: eventName, data: JSON.parse(dataStr) as Record<string, unknown> });
    } catch {
      events.push({ event: eventName, data: { raw: dataStr } });
    }
  }
  return { events, remainder };
}

export async function streamSessionChat(
  gatewayUrl: string,
  sessionId: string,
  message: string,
  apiKey?: string | null,
  onEvent?: (event: ChatStreamEvent) => void,
  systemMessage?: string,
): Promise<string> {
  const body: Record<string, string> = { message };
  if (systemMessage?.trim()) {
    body.system_message = systemMessage.trim();
  }
  const response = await fetch(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
    {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new HermesGatewayApiError(0, 'Streaming not supported on this device');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.remainder;
    for (const evt of parsed.events) {
      onEvent?.(evt);
      if (evt.event === 'assistant.delta') {
        const delta = evt.data.delta;
        if (typeof delta === 'string') assistantText += delta;
      }
      if (evt.event === 'assistant.completed' && typeof evt.data.content === 'string') {
        assistantText = evt.data.content;
      }
    }
  }

  return assistantText;
}
