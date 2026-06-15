import type {
  EnqueuedEvent,
  HealthResponse,
  PairCompleteResponse,
  QueueResponse,
} from '../types/agentLeash';
import type { PendingApproval } from '../types/gateway';

export const DEFAULT_AGENTLEASH_CLOUD_URL = 'https://agentleash-cloud.fly.dev';

export class AgentLeashApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new AgentLeashApiError(response.status, text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function enqueuedEventToPendingApproval(event: EnqueuedEvent): PendingApproval {
  const hook = event.event ?? {};
  const command =
    hook.tool_input?.command ??
    (hook.tool_input?.file_path
      ? `${hook.tool_input.file_path}${hook.tool_input.content ? ' (write)' : ''}`
      : undefined);

  return {
    actionId: event.id,
    toolName: hook.tool_name ?? 'AgentTool',
    reason:
      event.reason ??
      hook.hook_event_name ??
      'Agent tool call requires your approval before running on your Mac.',
    command,
    receivedAt: new Date(event.enqueued_at ?? Date.now()).toISOString(),
  };
}

export async function fetchAgentLeashHealth(cloudUrl: string): Promise<HealthResponse> {
  const response = await fetch(`${normalizeBaseUrl(cloudUrl)}/v1/health`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson<HealthResponse>(response);
}

export async function completePairing(cloudUrl: string, code: string): Promise<string> {
  const response = await fetch(`${normalizeBaseUrl(cloudUrl)}/v1/pair/complete`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
  const body = await parseJson<PairCompleteResponse>(response);
  if (!body.mobile_token) {
    throw new Error('Pairing response missing mobile_token');
  }
  return body.mobile_token;
}

export async function fetchQueue(cloudUrl: string, mobileToken: string): Promise<QueueResponse> {
  const response = await fetch(`${normalizeBaseUrl(cloudUrl)}/v1/queue`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Mobile ${mobileToken}`,
    },
  });
  return parseJson<QueueResponse>(response);
}

export async function submitVerdict(
  cloudUrl: string,
  mobileToken: string,
  eventId: string,
  decision: 'allow' | 'block',
  reason?: string,
): Promise<void> {
  const response = await fetch(`${normalizeBaseUrl(cloudUrl)}/v1/verdicts/${eventId}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Mobile ${mobileToken}`,
    },
    body: JSON.stringify({ decision, reason }),
  });
  await parseJson<{ ok: boolean }>(response);
}

export async function requestTestIntercept(cloudUrl: string, mobileToken: string): Promise<void> {
  const response = await fetch(`${normalizeBaseUrl(cloudUrl)}/v1/test-intercept`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Mobile ${mobileToken}`,
    },
  });
  await parseJson<{ ok: boolean }>(response);
}
