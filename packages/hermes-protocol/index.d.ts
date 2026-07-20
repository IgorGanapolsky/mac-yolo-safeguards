export type ThreadEventKind =
  | "user_message"
  | "assistant_message"
  | "thread_title_set"
  | "thread_deleted";

export const PROTOCOL_SCHEMA_VERSION: 1;
export const THREAD_EVENT_KINDS: readonly ThreadEventKind[];

export class ProtocolValidationError extends Error {}
export class MutationConflictError extends Error {}
export class ThreadDeletedError extends Error {}

export interface ThreadMutation {
  account_id: string;
  thread_id: string;
  mutation_id: string;
  author_device_id: string;
  kind: ThreadEventKind;
  payload: Record<string, unknown>;
}

export interface ThreadEvent extends ThreadMutation {
  schema_version: 1;
  event_id: string;
  seq: number;
  occurred_at: string;
}

export interface ProjectedThread {
  schema_version: 1;
  title: string | null;
  deleted: boolean;
  messages: Array<{
    message_id: string;
    role: "user" | "assistant";
    text: string;
    attachments: unknown[];
    seq: number;
    occurred_at: string;
  }>;
  gaps: Array<{ from_seq: number; to_seq: number }>;
  last_seq: number;
}

export interface RelayState {
  schema_version: 1;
  threads: ThreadEvent[][];
}

export interface AppendResult {
  created: boolean;
  event: ThreadEvent;
}

export interface ThreadSummary {
  thread_id: string;
  title: string | null;
  deleted: boolean;
  last_seq: number;
  updated_at: string | null;
  message_count: number;
  last_message_preview: string | null;
}

export interface CommitContext {
  request: import("node:http").IncomingMessage;
  result: AppendResult;
}

export class RelayStore {
  constructor(options?: { clock?: () => string; eventIdFactory?: () => string });
  append(input: ThreadMutation): AppendResult;
  listEvents(accountId: string, threadId: string, options?: { afterSeq?: number }): ThreadEvent[];
  getThread(accountId: string, threadId: string): ProjectedThread;
  listThreads(accountId: string, options?: { includeDeleted?: boolean }): ThreadSummary[];
  exportState(): RelayState;
  static fromState(
    state: unknown,
    options?: { clock?: () => string; eventIdFactory?: () => string },
  ): RelayStore;
}

export function createRelayHttpServer(options?: {
  store?: RelayStore;
  tokens?: Map<string, string>;
  maxBodyBytes?: number;
  dropResponseAfterCommit?: (context: CommitContext) => boolean;
}): { server: import("node:http").Server; store: RelayStore };
export function listenOnRandomPort(server: import("node:http").Server): Promise<string>;
export function closeServer(server: import("node:http").Server): Promise<void>;
export function validateId(value: unknown, fieldName: string): string;
export function validatePayload(
  kind: ThreadEventKind,
  payload: unknown,
): Record<string, unknown>;
export function validateMutation(input: unknown): ThreadMutation & { schema_version: 1 };
export function validateEvent(input: unknown): ThreadEvent;
export function mutationFingerprint(mutation: ThreadMutation): string;
export function projectThread(events: ThreadEvent[]): ProjectedThread;
