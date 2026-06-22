import type { ChatStreamEvent } from '../types/gatewayApi';
import type { ChatTimelineItem, RunProgressState } from '../types/chatDisplay';

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
  const detail = progress.detail?.trim() || progress.phase;
  return `⌛ Working — ${timeLabel} — ${detail}`;
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
): RunProgressState {
  if (state.runProgress) {
    return { ...state.runProgress, detail, phase };
  }
  return { phase, startedAtMs: Date.now(), detail };
}

export function applyStreamEvent(
  state: StreamActivityState,
  evt: ChatStreamEvent,
): StreamActivityState {
  const eventName = String(evt.event ?? '').toLowerCase();
  const data = evt.data;
  const toolCalls = [...state.toolCalls];
  let runProgress = state.runProgress;

  if (
    eventName === 'run.status' ||
    eventName === 'run.progress' ||
    eventName === 'status.update' ||
    eventName === 'provider.waiting'
  ) {
    const detail = String(
      data.detail ?? data.message ?? data.phase ?? data.status ?? 'working',
    );
    runProgress = startRunProgress({ ...state, runProgress }, detail);
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
    }
    return { runProgress, toolCalls };
  }

  if (eventName === 'assistant.delta') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      'waiting for provider response (streaming)',
      'streaming',
    );
    return { runProgress, toolCalls };
  }

  if (eventName === 'approval.request') {
    runProgress = startRunProgress(
      { ...state, runProgress },
      'waiting for your approval',
      'approval',
    );
    return { runProgress, toolCalls };
  }

  return state;
}
