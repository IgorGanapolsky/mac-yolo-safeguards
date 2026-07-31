import AsyncStorage from '@react-native-async-storage/async-storage';
import { THUMBGATE_API_URL } from '../constants/appIdentity';
import type { ThumbgateCaptureSignal } from '../utils/leashThumbgate';

const OFFLINE_QUEUE_KEY = '@thumbgate_offline_feedback_queue';
const MAX_QUEUED_FEEDBACK = 50;

export class ThumbgateApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ThumbgateFeedbackPayload = {
  signal: ThumbgateCaptureSignal;
  context: string;
  whatWentWrong?: string;
  whatWorked?: string;
  whatToChange?: string;
  tags?: string[];
  queuedAtMs?: number;
};

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

/** Cache offline feedback payload into AsyncStorage so no signals are dropped. */
export async function enqueueOfflineThumbgateFeedback(
  body: ThumbgateFeedbackPayload,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const list: ThumbgateFeedbackPayload[] = raw ? JSON.parse(raw) : [];
    list.push({ ...body, queuedAtMs: Date.now() });
    const trimmed = list.slice(-MAX_QUEUED_FEEDBACK);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Best-effort storage fallback
  }
}

/** Drain and flush any queued offline feedback to ThumbGate API. */
export async function flushOfflineThumbgateFeedback(
  apiUrl?: string,
  apiKey?: string | null,
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const list: ThumbgateFeedbackPayload[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    const remaining: ThumbgateFeedbackPayload[] = [];
    let flushedCount = 0;

    for (const item of list) {
      try {
        await captureThumbgateFeedback(apiUrl || THUMBGATE_API_URL, item, apiKey, false);
        flushedCount++;
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    return flushedCount;
  } catch {
    return 0;
  }
}

export async function captureThumbgateFeedback(
  apiUrl: string,
  body: ThumbgateFeedbackPayload,
  apiKey?: string | null,
  enqueueOnFailure = true,
): Promise<{ accepted: boolean; feedbackId?: string; queuedOffline?: boolean }> {
  const base = normalizeBaseUrl(apiUrl || THUMBGATE_API_URL);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  try {
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
  } catch (err) {
    if (enqueueOnFailure) {
      await enqueueOfflineThumbgateFeedback(body);
      return { accepted: true, queuedOffline: true };
    }
    throw err;
  }
}
