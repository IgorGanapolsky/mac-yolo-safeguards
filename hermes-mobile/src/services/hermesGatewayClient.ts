import { Platform } from 'react-native';
import { buildAuthHeaders, normalizeGatewayUrl } from './gatewayClient';
import type {
  HermesCapabilities,
  HermesCronJob,
  HermesSkill,
  HermesToolset,
  ChatStreamEvent,
} from '../types/gatewayApi';
import { extractAssistantFromRunCompletedPayload } from '../utils/streamAssistantText';
import { createChatSendPerformanceTracker } from './chatSendPerformance';
import type { GatewayContentPart } from '../utils/chatAttachments';

export class HermesGatewayApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Non-stream chat turn — LLM/agent runs can exceed default fetch timeouts. */
export const CHAT_TURN_TIMEOUT_MS = 300_000;

/** Wait for first SSE byte (Ollama cold start on the Mac). */
export const CHAT_STREAM_FIRST_BYTE_MS = 30_000;

/** No SSE activity — agent or model stalled. */
export const CHAT_STREAM_IDLE_MS = 30_000;

/** Hard cap for one streamed chat turn. */
export const CHAT_STREAM_MAX_MS = 900_000;

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

export async function deleteJob(
  gatewayUrl: string,
  jobId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(apiKey),
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

export async function clearAllSessions(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(`${base(gatewayUrl)}/api/sessions`, {
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

export type HermesRunStatus = {
  object?: string;
  run_id?: string;
  status?: string;
  last_event?: string;
  updated_at?: number;
  created_at?: number;
};

export async function getRunStatus(
  gatewayUrl: string,
  runId: string,
  apiKey?: string | null,
): Promise<HermesRunStatus | null> {
  const response = await fetch(
    `${base(gatewayUrl)}/v1/runs/${encodeURIComponent(runId)}`,
    { headers: buildAuthHeaders(apiKey) },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
  }
  return (await response.json()) as HermesRunStatus;
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

function accumulateAssistantText(events: ChatStreamEvent[], prior = ''): string {
  let assistantText = prior;
  for (const evt of events) {
    if (evt.event === 'assistant.delta' && typeof evt.data.delta === 'string') {
      assistantText += evt.data.delta;
    }
    if (evt.event === 'assistant.completed' && typeof evt.data.content === 'string') {
      assistantText = evt.data.content;
    }
    if (evt.event === 'run.completed' || evt.event === 'done') {
      const fromTranscript = extractAssistantFromRunCompletedPayload(evt.data);
      if (fromTranscript) {
        assistantText = fromTranscript;
      }
    }
  }
  return assistantText;
}

function consumeSseBuffer(
  buffer: string,
  onEvent?: (event: ChatStreamEvent) => void,
  assistantText = '',
): { remainder: string; assistantText: string } {
  const parsed = parseSseChunk(buffer);
  for (const evt of parsed.events) {
    onEvent?.(evt);
  }
  return {
    remainder: parsed.remainder,
    assistantText: accumulateAssistantText(parsed.events, assistantText),
  };
}

type StreamFatalCapture = { error: Error | null };

function wrapStreamEventHandler(
  onEvent: ((event: ChatStreamEvent) => void) | undefined,
  fatal: StreamFatalCapture,
): ((event: ChatStreamEvent) => void) | undefined {
  if (!onEvent) {
    return (evt: ChatStreamEvent) => {
      noteStreamFatal(evt, fatal);
    };
  }
  return (evt: ChatStreamEvent) => {
    onEvent(evt);
    noteStreamFatal(evt, fatal);
  };
}

function noteStreamFatal(evt: ChatStreamEvent, fatal: StreamFatalCapture): void {
  const eventName = String(evt.event ?? '').toLowerCase();
  if (eventName === 'run.failed' || eventName === 'error') {
    const detail = String(evt.data?.error ?? evt.data?.message ?? 'Agent run failed on your computer.');
    fatal.error = new Error(detail);
  }
}

async function readChatStreamFromReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent?: (event: ChatStreamEvent) => void,
): Promise<string> {
  const fatal: StreamFatalCapture = { error: null };
  const dispatch = wrapStreamEventHandler(onEvent, fatal);
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let lastActivity = Date.now();
  const startedAt = lastActivity;

  while (true) {
    if (Date.now() - startedAt > CHAT_STREAM_MAX_MS) {
      throw new Error('Chat stream exceeded maximum wait time.');
    }
    if (assistantText && Date.now() - lastActivity > CHAT_STREAM_IDLE_MS) {
      throw new Error('Chat stream stalled — no updates from your computer.');
    }

    const readPromise = reader.read();
    const timeoutPromise = new Promise<never>((_, reject) => {
      const waitMs = assistantText ? CHAT_STREAM_IDLE_MS : CHAT_STREAM_FIRST_BYTE_MS;
      setTimeout(() => {
        reject(
          new Error(
            assistantText
              ? 'Chat stream stalled — no updates from your computer.'
              : 'Chat stream timed out waiting for your computer. Check that Ollama is running on your computer.',
          ),
        );
      }, waitMs);
    });

    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([readPromise, timeoutPromise]);
    } finally {
      // readPromise continues in background if timeout wins — acceptable for mobile UX.
    }

    const { done, value } = chunk;
    if (done) {
      break;
    }
    lastActivity = Date.now();
    buffer += decoder.decode(value, { stream: true });
    const consumed = consumeSseBuffer(buffer, dispatch, assistantText);
    buffer = consumed.remainder;
    assistantText = consumed.assistantText;
  }

  if (buffer.trim()) {
    const consumed = consumeSseBuffer(buffer, dispatch, assistantText);
    assistantText = consumed.assistantText;
  }

  if (fatal.error && !assistantText.trim()) {
    throw fatal.error;
  }
  return assistantText;
}

function readChatStreamViaXhr(
  url: string,
  headers: Record<string, string>,
  body: string,
  onEvent?: (event: ChatStreamEvent) => void,
  onStreamAccepted?: () => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fatal: StreamFatalCapture = { error: null };
    const dispatch = wrapStreamEventHandler(onEvent, fatal);
    const xhr = new XMLHttpRequest();
    let assistantText = '';
    let buffer = '';
    let parsedLength = 0;
    let firstByteSeen = false;
    const startedAt = Date.now();
    let lastActivity = startedAt;
    let settled = false;
    let acceptedNotified = false;

    const notifyAccepted = () => {
      if (acceptedNotified || settled) {
        return;
      }
      acceptedNotified = true;
      onStreamAccepted?.();
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      xhr.abort();
      reject(error);
    };

    const succeed = (text: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(text);
    };

    const timer = setInterval(() => {
      const now = Date.now();
      if (!firstByteSeen && now - startedAt > CHAT_STREAM_FIRST_BYTE_MS) {
        fail(
          new Error(
            'Chat stream timed out waiting for your computer. Check that Ollama is running on your computer.',
          ),
        );
        return;
      }
      if (firstByteSeen && now - lastActivity > CHAT_STREAM_IDLE_MS) {
        fail(new Error('Chat stream stalled — no updates from your computer.'));
        return;
      }
      if (now - startedAt > CHAT_STREAM_MAX_MS) {
        fail(new Error('Chat stream exceeded maximum wait time.'));
      }
    }, 1000);

    xhr.open('POST', url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) {
        if (xhr.status === 200) {
          notifyAccepted();
        } else if (xhr.status > 0) {
          fail(new HermesGatewayApiError(xhr.status, xhr.responseText || `HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(parsedLength);
      if (!chunk) {
        return;
      }
      parsedLength = xhr.responseText.length;
      firstByteSeen = true;
      lastActivity = Date.now();
      buffer += chunk;
      const consumed = consumeSseBuffer(buffer, dispatch, assistantText);
      buffer = consumed.remainder;
      assistantText = consumed.assistantText;
    };
    xhr.onload = () => {
      if (xhr.status !== 200) {
        fail(new HermesGatewayApiError(xhr.status, xhr.responseText || `HTTP ${xhr.status}`));
        return;
      }
      if (buffer.trim()) {
        const consumed = consumeSseBuffer(buffer, dispatch, assistantText);
        assistantText = consumed.assistantText;
      }
      if (fatal.error && !assistantText.trim()) {
        fail(fatal.error);
        return;
      }
      succeed(assistantText);
    };
    xhr.onerror = () => {
      fail(new Error('Network request failed while streaming chat from your computer.'));
    };
    xhr.onabort = () => {
      if (!settled) {
        fail(new Error('Chat stream was cancelled.'));
      }
    };
    xhr.send(body);
  });
}

function useNativeChatStreamTransport(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

async function readChatStreamFromResponse(
  response: Response,
  onEvent?: (event: ChatStreamEvent) => void,
): Promise<string> {
  const reader = response.body?.getReader?.();
  if (reader) {
    return readChatStreamFromReader(reader, onEvent);
  }

  const fatal: StreamFatalCapture = { error: null };
  const dispatch = wrapStreamEventHandler(onEvent, fatal);
  const text = await response.text();
  const consumed = consumeSseBuffer(text, dispatch);
  if (fatal.error && !consumed.assistantText.trim()) {
    throw fatal.error;
  }
  return consumed.assistantText;
}

export async function streamSessionChat(
  gatewayUrl: string,
  sessionId: string,
  message: string | GatewayContentPart[],
  apiKey?: string | null,
  onEvent?: (event: ChatStreamEvent) => void,
  systemMessage?: string,
  onStreamAccepted?: () => void,
): Promise<string> {
  const body: Record<string, any> = { message };
  if (systemMessage?.trim()) {
    body.system_message = systemMessage.trim();
  }
  const url = `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`;
  const headers = jsonHeaders(apiKey);
  const payload = JSON.stringify(body);
  const nativeTransport = useNativeChatStreamTransport();
  const performanceTracker = createChatSendPerformanceTracker({
    transport: nativeTransport ? 'xhr-sse' : 'fetch-sse',
    message,
    hasSystemMessage: Boolean(systemMessage?.trim()),
  });
  const trackedOnEvent = performanceTracker.wrapEventHandler(onEvent);
  const trackedStreamAccepted = () => {
    performanceTracker.markAccepted();
    onStreamAccepted?.();
  };

  if (nativeTransport) {
    try {
      const result = await readChatStreamViaXhr(
        url,
        headers,
        payload,
        trackedOnEvent,
        trackedStreamAccepted,
      );
      void performanceTracker.trackSuccess();
      return result;
    } catch (error) {
      void performanceTracker.trackFailure(error);
      throw error;
    }
  }

  const controller = new AbortController();
  const maxTimer = setTimeout(() => controller.abort(), CHAT_STREAM_MAX_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new HermesGatewayApiError(response.status, text || `HTTP ${response.status}`);
    }
    trackedStreamAccepted();
    const result = await readChatStreamFromResponse(response, trackedOnEvent);
    void performanceTracker.trackSuccess();
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new Error('Chat stream exceeded maximum wait time.');
      void performanceTracker.trackFailure(timeoutError);
      throw timeoutError;
    }
    void performanceTracker.trackFailure(error);
    throw error;
  } finally {
    clearTimeout(maxTimer);
  }
}

export interface ObsidianProject {
  name: string;
  workspacePath: string;
  vaultHome: string;
  rule: string;
}

export interface ObsidianAgent {
  name: string;
  status: string;
  role: string;
  lastActive: number;
}

export async function getObsidianProjects(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<ObsidianProject[]> {
  const response = await fetch(`${base(gatewayUrl)}/v1/obsidian/projects`, {
    headers: buildAuthHeaders(apiKey),
  });
  const body = await parseJson<{ data?: ObsidianProject[] }>(response);
  return body.data ?? [];
}

export async function getObsidianAgents(
  gatewayUrl: string,
  apiKey?: string | null,
): Promise<ObsidianAgent[]> {
  const response = await fetch(`${base(gatewayUrl)}/v1/obsidian/agents`, {
    headers: buildAuthHeaders(apiKey),
  });
  const body = await parseJson<{ data?: ObsidianAgent[] }>(response);
  return body.data ?? [];
}
