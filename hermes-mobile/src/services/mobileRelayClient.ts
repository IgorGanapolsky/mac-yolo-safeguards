import type {
  EnqueuedEvent,
  HealthResponse,
  PairCompleteResponse,
  QueueResponse,
} from '../types/mobileRelay';
import type { PendingApproval } from '../types/gateway';
import { HERMES_MOBILE_CLOUD_URL } from '../constants/appIdentity';

export { HERMES_MOBILE_CLOUD_URL as DEFAULT_HERMES_MOBILE_CLOUD_URL };

export function resolveCloudRelayUrl(configured?: string | null): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  return HERMES_MOBILE_CLOUD_URL;
}

export class MobileRelayApiError extends Error {
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
    throw new MobileRelayApiError(response.status, text || `HTTP ${response.status}`);
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
      'Agent tool call requires your approval before running on your computer.',
    command,
    receivedAt: new Date(event.enqueued_at ?? Date.now()).toISOString(),
  };
}

export async function fetchMobileRelayHealth(cloudUrl: string): Promise<HealthResponse> {
  const base = normalizeBaseUrl(cloudUrl);
  const response = await fetch(`${base}/v1/health`, {
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
