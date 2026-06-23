export type ChatTimelineItemKind = 'user' | 'assistant' | 'tool_call';

export type ToolCallStatus = 'running' | 'completed' | 'error';

export interface ChatTimelineItem {
  id: string;
  kind: ChatTimelineItemKind;
  content: string;
  toolName?: string;
  toolCommand?: string;
  toolStatus?: ToolCallStatus;
  created_at?: string;
}

export interface RunProgressState {
  phase: string;
  startedAtMs: number;
  detail?: string;
  runId?: string;
  sessionId?: string;
}

