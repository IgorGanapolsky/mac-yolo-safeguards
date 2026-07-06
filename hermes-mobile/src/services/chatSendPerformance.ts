import type { ChatStreamEvent } from '../types/gatewayApi';
import { trackProductEvent } from './productAnalytics';

export type ChatSendTransport = 'fetch-sse' | 'xhr-sse';
export type ChatSendPerformanceStatus = 'success' | 'failed' | 'timeout';

export type ChatSendPerformanceSample = {
  transport: ChatSendTransport;
  messageLength: number;
  hasSystemMessage: boolean;
  startedAtMs: number;
  acceptedAtMs?: number | null;
  firstResponseAtMs?: number | null;
  completedAtMs?: number | null;
  failedAtMs?: number | null;
  status: ChatSendPerformanceStatus;
  errorName?: string | null;
  errorKind?: string | null;
};

export type ChatSendPerformanceDurations = {
  acceptedMs?: number;
  firstResponseMs?: number;
  completedMs?: number;
};

export type ChatSendPerformanceEvaluation = {
  durations: ChatSendPerformanceDurations;
  breachedBudgets: string[];
  slowestStage: string | null;
};

export const CHAT_SEND_PERFORMANCE_BUDGETS_MS = {
  accepted: 1_000,
  firstResponse: 2_500,
  completed: 15_000,
} as const;

function duration(startedAtMs: number, endedAtMs?: number | null): number | undefined {
  if (typeof endedAtMs !== 'number' || !Number.isFinite(endedAtMs)) return undefined;
  return Math.max(0, Math.round(endedAtMs - startedAtMs));
}

function isResponseEvent(event: ChatStreamEvent): boolean {
  if (event.event === 'assistant.delta') {
    return typeof event.data.delta === 'string' && event.data.delta.length > 0;
  }
  if (event.event === 'assistant.completed') {
    return typeof event.data.content === 'string' && event.data.content.length > 0;
  }
  if (event.event === 'run.completed' || event.event === 'done') {
    return true;
  }
  return false;
}

function errorStatus(error: unknown): ChatSendPerformanceStatus {
  if (error instanceof Error) {
    const detail = `${error.name} ${error.message}`.toLowerCase();
    if (detail.includes('timeout') || detail.includes('timed out') || detail.includes('exceeded')) {
      return 'timeout';
    }
  }
  return 'failed';
}

function errorName(error: unknown): string | null {
  return error instanceof Error && error.name ? error.name : null;
}

function errorKind(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const detail = `${error.name} ${error.message}`.toLowerCase();
  if (detail.includes('timeout') || detail.includes('timed out') || detail.includes('exceeded')) {
    return 'timeout';
  }
  if (detail.includes('network') || detail.includes('fetch') || detail.includes('connection')) {
    return 'network';
  }
  if (detail.includes('abort')) {
    return 'abort';
  }
  if (detail.includes('http') || detail.includes('api')) {
    return 'api';
  }
  return 'unknown';
}

export function evaluateChatSendPerformance(
  sample: ChatSendPerformanceSample,
): ChatSendPerformanceEvaluation {
  const durations: ChatSendPerformanceDurations = {
    acceptedMs: duration(sample.startedAtMs, sample.acceptedAtMs),
    firstResponseMs: duration(sample.startedAtMs, sample.firstResponseAtMs),
    completedMs: duration(sample.startedAtMs, sample.completedAtMs ?? sample.failedAtMs),
  };
  const breachedBudgets: string[] = [];
  if (
    durations.acceptedMs !== undefined &&
    durations.acceptedMs > CHAT_SEND_PERFORMANCE_BUDGETS_MS.accepted
  ) {
    breachedBudgets.push('accepted');
  }
  if (
    durations.firstResponseMs !== undefined &&
    durations.firstResponseMs > CHAT_SEND_PERFORMANCE_BUDGETS_MS.firstResponse
  ) {
    breachedBudgets.push('first_response');
  }
  if (
    durations.completedMs !== undefined &&
    durations.completedMs > CHAT_SEND_PERFORMANCE_BUDGETS_MS.completed
  ) {
    breachedBudgets.push('completed');
  }
  return {
    durations,
    breachedBudgets,
    slowestStage: breachedBudgets[0] ?? null,
  };
}

export function chatSendPerformanceProperties(
  sample: ChatSendPerformanceSample,
): Record<string, string | number | boolean | null | undefined> {
  const evaluation = evaluateChatSendPerformance(sample);
  return {
    transport: sample.transport,
    status: sample.status,
    message_length: sample.messageLength,
    has_system_message: sample.hasSystemMessage,
    accepted_ms: evaluation.durations.acceptedMs,
    first_response_ms: evaluation.durations.firstResponseMs,
    completed_ms: evaluation.durations.completedMs,
    budget_accepted_ms: CHAT_SEND_PERFORMANCE_BUDGETS_MS.accepted,
    budget_first_response_ms: CHAT_SEND_PERFORMANCE_BUDGETS_MS.firstResponse,
    budget_completed_ms: CHAT_SEND_PERFORMANCE_BUDGETS_MS.completed,
    budget_breach_count: evaluation.breachedBudgets.length,
    slowest_stage: evaluation.slowestStage,
    error_name: sample.errorName,
    error_kind: sample.errorKind,
  };
}

export async function trackChatSendPerformance(
  sample: ChatSendPerformanceSample,
): Promise<void> {
  await trackProductEvent('chat_send_performance', chatSendPerformanceProperties(sample));
}

export function chatSendPayloadLength(message: string | unknown[]): number {
  if (typeof message === 'string') {
    return message.length;
  }
  return JSON.stringify(message).length;
}

export function createChatSendPerformanceTracker(input: {
  transport: ChatSendTransport;
  message: string | unknown[];
  hasSystemMessage: boolean;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const startedAtMs = now();
  let acceptedAtMs: number | null = null;
  let firstResponseAtMs: number | null = null;
  let settled = false;

  const baseSample = (): Omit<ChatSendPerformanceSample, 'status'> => ({
    transport: input.transport,
    messageLength: chatSendPayloadLength(input.message),
    hasSystemMessage: input.hasSystemMessage,
    startedAtMs,
    acceptedAtMs,
    firstResponseAtMs,
  });

  return {
    markAccepted() {
      if (acceptedAtMs === null) {
        acceptedAtMs = now();
      }
    },
    wrapEventHandler(onEvent?: (event: ChatStreamEvent) => void) {
      return (event: ChatStreamEvent) => {
        if (firstResponseAtMs === null && isResponseEvent(event)) {
          firstResponseAtMs = now();
        }
        onEvent?.(event);
      };
    },
    async trackSuccess() {
      if (settled) return;
      settled = true;
      await trackChatSendPerformance({
        ...baseSample(),
        status: 'success',
        completedAtMs: now(),
      });
    },
    async trackFailure(error: unknown) {
      if (settled) return;
      settled = true;
      await trackChatSendPerformance({
        ...baseSample(),
        status: errorStatus(error),
        failedAtMs: now(),
        errorName: errorName(error),
        errorKind: errorKind(error),
      });
    },
  };
}
