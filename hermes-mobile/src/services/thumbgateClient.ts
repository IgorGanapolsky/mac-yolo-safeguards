import { HERMES_MOBILE_CLOUD_URL, THUMBGATE_API_URL } from '../constants/appIdentity';
import type { ThumbgateCaptureSignal } from '../utils/leashThumbgate';
import { secureCredentials } from './secureCredentials';

export class ThumbgateApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

const SENSITIVE_VALUE = /(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+)/gi;

function sanitizeCaptureBody<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_VALUE, '[REDACTED]') as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeCaptureBody) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeCaptureBody(item)]),
    ) as T;
  }
  return value;
}

export async function captureThumbgateFeedback(
  apiUrl: string,
  body: {
    signal: ThumbgateCaptureSignal;
    context: string;
    whatWentWrong?: string;
    whatWorked?: string;
    whatToChange?: string;
    tags?: string[];
  },
  apiKey?: string | null,
): Promise<{ accepted: boolean; feedbackId?: string }> {
  const configuredBase = normalizeBaseUrl(apiUrl || THUMBGATE_API_URL);
  const mobileToken = apiKey?.trim() || configuredBase !== normalizeBaseUrl(THUMBGATE_API_URL)
    ? null
    : await secureCredentials.loadMobileToken();
  const useRelayProxy = !apiKey?.trim() && Boolean(mobileToken);
  const base = useRelayProxy ? normalizeBaseUrl(HERMES_MOBILE_CLOUD_URL) : configuredBase;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  } else if (useRelayProxy) {
    headers.Authorization = `Mobile ${mobileToken}`;
  }

  const response = await fetch(
    `${base}${useRelayProxy ? '/v1/thumbgate/capture' : '/v1/feedback/capture'}`,
    {
    method: 'POST',
    headers,
    body: JSON.stringify(sanitizeCaptureBody(body)),
    },
  );

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { detail: text };
    }
  }

  if (!response.ok) {
    const detail =
      typeof parsed.detail === 'string'
        ? parsed.detail
        : typeof parsed.message === 'string'
          ? parsed.message
          : text || `HTTP ${response.status}`;
    throw new ThumbgateApiError(response.status, detail);
  }

  const feedbackEvent = parsed.feedbackEvent as { id?: string } | undefined;
  return {
    accepted: Boolean(parsed.accepted),
    feedbackId:
      typeof parsed.feedbackId === 'string'
        ? parsed.feedbackId
        : feedbackEvent?.id,
  };
}
