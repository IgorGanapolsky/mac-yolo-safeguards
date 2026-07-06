export interface ChatProject {
  id: string;
  name: string;
  workspacePath: string;
  /** Stable project catalog slug. */
  vaultSlug?: string;
  /** Repo path from vault catalog (source_repo). */
  sourceRepo?: string;
  /** Latest handoff one-liner for this project. */
  handoffSummary?: string;
  /** Human-readable project role from the catalog. */
  role?: string;
  /** Hermes session ids created under this project (most recent first). */
  sessionIds: string[];
  activeSessionId?: string;
}

export interface ChatProjectState {
  projects: ChatProject[];
  /** Maps Hermes session id → project id (mobile-side; gateway has no cwd field). */
  sessionProjectMap: Record<string, string>;
  /** Mobile-pinned labels — gateway title/preview often mirrors the latest message. */
  sessionLabels: Record<string, string>;
  activeProjectId: string | null;
  /** Active project per saved computer profile (gateway profile id). */
  activeProjectByComputer?: Record<string, string | null>;
  /** Whether the user has cleared the initial demo threads. */
  demoCleared?: boolean;
}

export const EMPTY_CHAT_PROJECT_STATE: ChatProjectState = {
  projects: [],
  sessionProjectMap: {},
  sessionLabels: {},
  activeProjectId: null,
  demoCleared: false,
};
