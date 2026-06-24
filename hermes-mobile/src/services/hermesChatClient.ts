import { buildAuthHeaders, normalizeGatewayUrl, fetchWithTimeout } from './gatewayClient';
import { CHAT_TURN_TIMEOUT_MS } from './hermesGatewayClient';
import { coerceMessageId } from '../utils/messageIds';
import type {
  ChatTurnResponse,
  HermesMessage,
  HermesSession,
  MessageListResponse,
  SessionListResponse,
} from '../types/chat';
import {
  unescapeChatText,
  formatMessageForDisplay,
  normalizeChatMessage,
} from '../utils/chatMessageDisplay';

export class HermesChatApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new HermesChatApiError(response.status, text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function base(gatewayUrl: string): string {
  return normalizeGatewayUrl(gatewayUrl).httpBase;
}

function headers(apiKey?: string | null): Record<string, string> {
  return {
    ...buildAuthHeaders(apiKey),
    'Content-Type': 'application/json',
  };
}

export function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return formatMessageForDisplay(content);
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return unescapeChatText(part);
        if (part && typeof part === 'object' && 'text' in part) {
          return unescapeChatText(String((part as { text?: string }).text ?? ''));
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return formatMessageForDisplay(joined);
  }
  if (content && typeof content === 'object') {
    return formatMessageForDisplay(JSON.stringify(content));
  }
  return formatMessageForDisplay(String(content ?? ''));
}

export function extractAssistantText(body: ChatTurnResponse): string {
  if (body.message?.content) {
    return normalizeMessageContent(body.message.content);
  }
  for (const key of ['output', 'content', 'response'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

export async function getSession(
  gatewayUrl: string,
  sessionId: string,
  apiKey?: string | null,
): Promise<HermesSession | null> {
  const response = await fetchWithTimeout(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}`,
    { headers: headers(apiKey) },
    10000,
  );
  if (response.status === 404) {
    return null;
  }
  const body = await parseJson<{ session?: HermesSession }>(response);
  return body.session ?? null;
}

export async function listSessions(
  gatewayUrl: string,
  apiKey?: string | null,
  limit = 50,
): Promise<HermesSession[]> {
  const response = await fetchWithTimeout(
    `${base(gatewayUrl)}/api/sessions?limit=${limit}`,
    { headers: headers(apiKey) },
    15000,
  );
  const body = await parseJson<SessionListResponse>(response);
  return body.data ?? [];
}

export async function createSession(
  gatewayUrl: string,
  apiKey?: string | null,
  title?: string,
  systemPrompt?: string,
): Promise<HermesSession> {
  const body: Record<string, string> = { title: title ?? 'Mobile chat' };
  if (systemPrompt?.trim()) {
    body.system_prompt = systemPrompt.trim();
  }
  const response = await fetchWithTimeout(`${base(gatewayUrl)}/api/sessions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{ session: HermesSession }>(response);
  return parsed.session;
}

export async function listMessages(
  gatewayUrl: string,
  sessionId: string,
  apiKey?: string | null,
): Promise<HermesMessage[]> {
  const response = await fetchWithTimeout(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    { headers: headers(apiKey) },
    15000,
  );
  const body = await parseJson<MessageListResponse>(response);
  return (body.data ?? []).map((message, index) => {
    const rawText =
      typeof message.content === 'string'
        ? message.content
        : normalizeMessageContent(message.content);
    return normalizeChatMessage({
      ...message,
      id: coerceMessageId(message.id, index),
      content: rawText,
    });
  });
}

export async function sendChatMessage(
  gatewayUrl: string,
  sessionId: string,
  message: string,
  apiKey?: string | null,
  systemMessage?: string,
): Promise<{ assistantText: string; raw: ChatTurnResponse }> {
  const body: Record<string, string> = { message };
  if (systemMessage?.trim()) {
    body.system_message = systemMessage.trim();
  }
  const response = await fetchWithTimeout(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/chat`,
    {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(body),
    },
    CHAT_TURN_TIMEOUT_MS,
  );
  const parsed = await parseJson<ChatTurnResponse>(response);
  return { assistantText: extractAssistantText(parsed), raw: parsed };
}
