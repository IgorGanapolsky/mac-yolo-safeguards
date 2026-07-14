export interface HermesSession {
  id: string;
  title?: string | null;
  source?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  /** Lifetime LLM API calls — divides cumulative tokens into per-call context size. */
  api_call_count?: number;
  tool_call_count?: number;
  /** ISO string from mobile-created sessions */
  last_active_at?: string;
  /** ISO string when the session was first created (mobile or gateway started_at). */
  created_at?: string;
  /** Unix seconds (float) from Hermes gateway :8642 */
  last_active?: number | string;
  started_at?: number | string;
  message_count?: number;
  preview?: string;
}

export interface HermesMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  /** Full cleaned text when `content` is a shortened preview. */
  rawContent?: string;
  /** Original gateway payload before mobile sanitization (tool XML / JSON). */
  gatewayContent?: string;
  /** Is the message content truncated for preview. */
  truncated?: boolean;
  /** ISO string from mobile-created messages */
  created_at?: string;
  /** Unix seconds or ISO from Hermes gateway :8642 */
  timestamp?: number | string;
  /** Gateway session id when shown in merged Telegram inbox. */
  sourceSessionId?: string;
  /** Short label for merged Telegram inbox bubbles. */
  threadLabel?: string;
  /** Mobile outbox delivery — Codex shows send ack implicitly; we show explicitly. */
  outboundStatus?: 'pending' | 'sent' | 'failed';
  /** Short human reason when outboundStatus is failed (API/auth/session, not connectivity). */
  outboundFailureReason?: string;
  isCollapsedToolActivity?: boolean;
  activities?: HermesMessage[];
}

export interface SessionListResponse {
  object: string;
  data: HermesSession[];
  limit?: number;
  offset?: number;
  has_more?: boolean;
}

export interface MessageListResponse {
  object: string;
  session_id: string;
  data: HermesMessage[];
}

export interface ChatTurnResponse {
  object?: string;
  session_id?: string;
  message?: HermesMessage;
  output?: string;
  content?: string;
  response?: string;
}
