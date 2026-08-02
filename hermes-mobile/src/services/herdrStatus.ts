/**
 * Herdr Agent Multiplexer Integration Service for Hermes Mobile & ThumbGate.app.
 * Interoperates with local & remote Herdr sessions (https://herdr.dev).
 */

export type HerdrAgentState = 'working' | 'blocked' | 'done' | 'idle' | 'unknown';

export type HerdrAgentInfo = {
  id: string;
  name: string;
  kind: string;
  state: HerdrAgentState;
  workspaceId: string;
  tabId: string;
  paneId: string;
  terminalTitle?: string;
};

export type HerdrSessionSummary = {
  connected: boolean;
  totalPanes: number;
  totalAgents: number;
  workingCount: number;
  blockedCount: number;
  doneCount: number;
  idleCount: number;
  agents: HerdrAgentInfo[];
  summaryText: string;
};

/**
 * Parses raw JSON output from `herdr agent list --json` or Herdr socket API.
 */
export function parseHerdrAgentsResponse(rawJson: unknown): HerdrAgentInfo[] {
  if (!rawJson || typeof rawJson !== 'object') {
    return [];
  }
  const items = Array.isArray(rawJson)
    ? rawJson
    : (rawJson as { agents?: unknown[]; result?: { agents?: unknown[] } }).agents ||
      (rawJson as { result?: { agents?: unknown[] } }).result?.agents ||
      [];

  return items.map((item: any) => {
    const stateStr = String(item.state || item.status || 'unknown').toLowerCase();
    let state: HerdrAgentState = 'unknown';
    if (stateStr === 'working' || stateStr === 'running') state = 'working';
    else if (stateStr === 'blocked' || stateStr === 'waiting' || stateStr === 'needs_attention') state = 'blocked';
    else if (stateStr === 'done' || stateStr === 'completed') state = 'done';
    else if (stateStr === 'idle') state = 'idle';

    return {
      id: String(item.id || item.agent_id || item.pane_id || 'unknown'),
      name: String(item.name || item.agent || 'Agent'),
      kind: String(item.kind || item.type || 'coding-agent'),
      state,
      workspaceId: String(item.workspace_id || item.workspace || 'w1'),
      tabId: String(item.tab_id || item.tab || 't1'),
      paneId: String(item.pane_id || item.pane || 'p1'),
      terminalTitle: item.terminal_title ? String(item.terminal_title) : undefined,
    };
  });
}

/**
 * Computes a human-friendly Herdr multiplexer summary.
 */
export function buildHerdrSessionSummary(agents: HerdrAgentInfo[], isConnected = true): HerdrSessionSummary {
  if (!isConnected) {
    return {
      connected: false,
      totalPanes: 0,
      totalAgents: 0,
      workingCount: 0,
      blockedCount: 0,
      doneCount: 0,
      idleCount: 0,
      agents: [],
      summaryText: 'Herdr multiplexer offline',
    };
  }

  const workingCount = agents.filter(a => a.state === 'working').length;
  const blockedCount = agents.filter(a => a.state === 'blocked').length;
  const doneCount = agents.filter(a => a.state === 'done').length;
  const idleCount = agents.filter(a => a.state === 'idle').length;

  const parts: string[] = [];
  if (workingCount > 0) parts.push(`${workingCount} working`);
  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
  if (doneCount > 0) parts.push(`${doneCount} done`);
  if (idleCount > 0) parts.push(`${idleCount} idle`);

  const summaryText = parts.length > 0 ? parts.join(' · ') : 'No active agent panes';

  return {
    connected: true,
    totalPanes: agents.length,
    totalAgents: agents.length,
    workingCount,
    blockedCount,
    doneCount,
    idleCount,
    agents,
    summaryText,
  };
}
