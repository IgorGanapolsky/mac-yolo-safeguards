import { THUMBGATE_API_URL } from '../constants/appIdentity';
import type { ThumbgateCaptureSignal } from '../utils/leashThumbgate';

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
  const base = normalizeBaseUrl(apiUrl || THUMBGATE_API_URL);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(`${base}/v1/feedback/capture`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

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
