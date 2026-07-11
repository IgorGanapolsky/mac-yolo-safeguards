import type { HermesSession } from '../types/chat';
import type { ChatStreamEvent } from '../types/gatewayApi';
import type { ChatTimelineItem, RunProgressState } from '../types/chatDisplay';
import { displayableLlmModel } from './runProgressDisplay';
import { stampRunProgressActivity } from './runStaleDetection';

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readUsageBlock(block: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return {};
  }
  const usage = block as Record<string, unknown>;
  const inputTokens =
    readNumber(usage.input_tokens) ??
    readNumber(usage.inputTokens) ??
    readNumber(usage.prompt_tokens) ??
    readNumber(usage.promptTokens);
  const outputTokens =
    readNumber(usage.output_tokens) ??
    readNumber(usage.outputTokens) ??
    readNumber(usage.completion_tokens) ??
    readNumber(usage.completionTokens);
  const totalTokens =
    readNumber(usage.total_tokens) ??
    readNumber(usage.totalTokens) ??
    (inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);
  return { inputTokens, outputTokens, totalTokens };
}

function readPayloadModel(data: Record<string, unknown>): string | undefined {
  return (
    readString(data.model) ??
    readString(data.model_id) ??
    readString(data.model_name) ??
    readString(data.llm_model) ??
    readString(data.llm) ??
    readString(data.provider_model) ??
    readString(data.active_model)
  );
}

function payloadHasUsageFields(data: Record<string, unknown>): boolean {
  const usage = {
    ...readUsageBlock(data.usage),
    ...readUsageBlock(data.token_usage),
    ...readUsageBlock(data.tokenUsage),
    ...readUsageBlock(data.stats),
  };
  return (
    readNumber(data.input_tokens) != null ||
    readNumber(data.inputTokens) != null ||
    readNumber(data.output_tokens) != null ||
    readNumber(data.outputTokens) != null ||
    readNumber(data.total_tokens) != null ||
    readNumber(data.totalTokens) != null ||
    usage.inputTokens != null ||
    usage.outputTokens != null ||
    usage.totalTokens != null
  );
}

/** Merge model + token fields from gateway SSE payloads or session records. */
export function mergeRunUsageFromPayload(
  progress: RunProgressState,
  data: Record<string, unknown>,
): RunProgressState {
  const usage = {
    ...readUsageBlock(data.usage),
    ...readUsageBlock(data.token_usage),
    ...readUsageBlock(data.tokenUsage),
    ...readUsageBlock(data.stats),
  };

  const payloadInput =
    readNumber(data.input_tokens) ??
    readNumber(data.inputTokens) ??
    usage.inputTokens;
  const payloadOutput =
    readNumber(data.output_tokens) ??
    readNumber(data.outputTokens) ??
    usage.outputTokens;
  const payloadTotal =
    readNumber(data.total_tokens) ??
    readNumber(data.totalTokens) ??
    usage.totalTokens;

  const inputTokens = payloadInput ?? progress.inputTokens;
  const outputTokens = payloadOutput ?? progress.outputTokens;
  const totalTokens =
    payloadTotal ??
    (inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : progress.totalTokens);

  const payloadModel = readPayloadModel(data);
  const model =
    payloadModel !== undefined
      ? (displayableLlmModel(payloadModel) ?? displayableLlmModel(progress.model) ?? undefined)
      : displayableLlmModel(progress.model) ?? undefined;

  const duration = readNumber(data.duration) ?? progress.duration;
  const streamUsageLive = payloadHasUsageFields(data) ? true : progress.streamUsageLive;

  return {
    ...progress,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    duration,
    streamUsageLive,
  };
}

export function extractRunMetadata(data: Record<string, unknown>): {
  runId?: string;
  sessionId?: string;
} {
  return {
    runId: readString(data.run_id) ?? readString(data.runId),
    sessionId: readString(data.session_id) ?? readString(data.sessionId),
  };
}

export function attachRunMetadata(
  progress: RunProgressState,
  data: Record<string, unknown>,
  prev?: RunProgressState | null,
): RunProgressState {
  const { runId, sessionId } = extractRunMetadata(data);
  return stampRunProgressActivity(prev ?? null, {
    ...progress,
    runId: runId ?? prev?.runId ?? progress.runId,
    sessionId: sessionId ?? prev?.sessionId ?? progress.sessionId,
  });
}

/** True when banner-visible run progress fields are unchanged (skip pointless re-renders). */
export function runProgressForDisplayEqual(
  a: RunProgressState | null | undefined,
  b: RunProgressState | null | undefined,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.phase === b.phase &&
    a.startedAtMs === b.startedAtMs &&
    (a.detail ?? '') === (b.detail ?? '') &&
    (a.model ?? '') === (b.model ?? '') &&
    (a.inputTokens ?? -1) === (b.inputTokens ?? -1) &&
    (a.outputTokens ?? -1) === (b.outputTokens ?? -1) &&
    (a.totalTokens ?? -1) === (b.totalTokens ?? -1) &&
    Boolean(a.streamUsageLive) === Boolean(b.streamUsageLive)
  );
}

export function mergeSessionUsageIntoRunProgress(
  progress: RunProgressState | null,
  session: Pick<HermesSession, 'model' | 'input_tokens' | 'output_tokens'>,
  fallbackDetail = 'Agent working…',
  options?: { skipUsageFields?: boolean },
): RunProgressState {
  const base: RunProgressState =
    progress ??
    ({
      phase: 'working',
      startedAtMs: Date.now(),
      detail: fallbackDetail,
    } satisfies RunProgressState);

  if (options?.skipUsageFields || base.streamUsageLive) {
    return mergeRunUsageFromPayload(base, { model: session.model });
  }

  return mergeRunUsageFromPayload(base, {
    model: session.model,
    input_tokens: session.input_tokens,
    output_tokens: session.output_tokens,
  });
}

export interface StreamActivityState {
  runProgress: RunProgressState | null;
  toolCalls: ChatTimelineItem[];
}

export function createStreamActivityState(): StreamActivityState {
  return { runProgress: null, toolCalls: [] };
}

export function formatRunProgressLabel(progress: RunProgressState, nowMs = Date.now()): string {
  const elapsedSec = Math.max(0, Math.floor((nowMs - progress.startedAtMs) / 1000));
  const elapsedMin = Math.floor(elapsedSec / 60);
  const timeLabel = elapsedMin >= 1 ? `${elapsedMin} min` : `${elapsedSec}s`;
  const phasePrefix =
    progress.phase === 'streaming' ? 'Live streaming' : progress.phase === 'sending' ? 'Sending' : 'Working';
  const detail = progress.detail?.trim() || progress.phase;
  return `⌛ ${phasePrefix} — ${timeLabel} — ${detail}`;
}

function extractCommandFromToolData(data: Record<string, unknown>): string | undefined {
  if (typeof data.command === 'string' && data.command.trim()) {
    return data.command.trim();
  }
  const args = data.arguments ?? data.args ?? data.input;
  if (typeof args === 'string' && args.trim()) {
    return args.trim();
  }
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    if (typeof record.command === 'string' && record.command.trim()) {
      return record.command.trim();
    }
    if (typeof record.action === 'string') {
      const action = record.action;
      const rest = { ...record };
      delete rest.action;
      const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
      return `${action}${tail}`.slice(0, 240);
    }
    return JSON.stringify(record).slice(0, 240);
  }
  return undefined;
}

function toolNameFromData(data: Record<string, unknown>): string {
  const name = data.tool_name ?? data.name ?? data.tool;
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  return 'tool';
}

function isToolEndEvent(eventName: string): boolean {
  return (
    eventName.includes('end') ||
    eventName.includes('complete') ||
    eventName.includes('result') ||
    eventName.includes('done') ||
    eventName.includes('finished')
  );
}

function findLastRunningToolIndex(toolCalls: ChatTimelineItem[], toolName: string): number {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const item = toolCalls[i];
    if (item.kind === 'tool_call' && item.toolName === toolName && item.toolStatus === 'running') {
      return i;
    }
  }
  return -1;
}

function startRunProgress(
  state: StreamActivityState,
  detail: string,
  phase = 'working',
  data?: Record<string, unknown>,
): RunProgressState {
  const raw = state.runProgress
    ? { ...state.runProgress, detail, phase }
    : { phase, startedAtMs: Date.now(), detail };
  const merged = data ? mergeRunUsageFromPayload(raw, data) : raw;
  return stampRunProgressActivity(state.runProgress, merged);
}

export function applyStreamEvent(
  state: StreamActivityState,
  evt: ChatStreamEvent,
): StreamActivityState {
  const eventName = String(evt.event ?? '').toLowerCase();
  const data = evt.data;
  const toolCalls = [...state.toolCalls];
  let runProgress = state.runProgress;

  if (eventName === 'run.started' || eventName === 'message.started') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      runProgress?.detail ?? 'Hermes is working on your computer…',
      runProgress?.phase ?? 'working',
      data,
    );
    return { runProgress, toolCalls };
  }

  if (eventName === 'tool.progress') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      runProgress?.detail ?? 'Hermes is working on your computer…',
      runProgress?.phase ?? 'working',
      data,
    );
    return { runProgress, toolCalls };
  }

  if (
    eventName === 'run.status' ||
    eventName === 'run.progress' ||
    eventName === 'status.update' ||
    eventName === 'provider.waiting'
  ) {
    const detail = String(
      data.detail ?? data.message ?? data.phase ?? data.status ?? 'working',
    );
    runProgress = startRunProgress({ ...state, runProgress }, detail, 'working', data);
    return { runProgress, toolCalls };
  }

  if (eventName.startsWith('tool.')) {
    const toolName = toolNameFromData(data);
    const command = extractCommandFromToolData(data);
    const callId = String(data.call_id ?? data.id ?? `${toolName}-${toolCalls.length}`);

    if (!isToolEndEvent(eventName)) {
      toolCalls.push({
        id: `live-tool-${callId}`,
        kind: 'tool_call',
        toolName,
        toolCommand: command,
        content: command ?? toolName,
        toolStatus: 'running',
      });
      runProgress = startRunProgress(
        { ...state, runProgress },
        command ? `running ${toolName}` : `running ${toolName}`,
        'working',
        data,
      );
    } else {
      const idx = findLastRunningToolIndex(toolCalls, toolName);
      const output = data.output ?? data.result ?? data.content;
      const outputText =
        typeof output === 'string'
          ? output
          : output != null
            ? JSON.stringify(output).slice(0, 280)
            : undefined;
      if (idx >= 0) {
        toolCalls[idx] = {
          ...toolCalls[idx],
          toolStatus: data.error ? 'error' : 'completed',
          content: outputText ?? toolCalls[idx].content,
        };
      } else if (outputText) {
        toolCalls.push({
          id: `live-tool-${callId}-result`,
          kind: 'tool_call',
          toolName,
          toolCommand: command,
          content: outputText,
          toolStatus: data.error ? 'error' : 'completed',
        });
      }
      runProgress = startRunProgress(
        { ...state, runProgress },
        runProgress?.detail ?? 'Hermes is working on your computer…',
        runProgress?.phase ?? 'working',
        data,
      );
    }
    return { runProgress, toolCalls };
  }

  if (eventName === 'assistant.delta') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      'waiting for provider response (streaming)',
      'streaming',
      data,
    );
    return { runProgress, toolCalls };
  }

  if (eventName === 'approval.request') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      'waiting for your approval',
      'approval',
      data,
    );
    return { runProgress, toolCalls };
  }

  return state;
}
