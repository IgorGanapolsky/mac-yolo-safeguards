/**
 * Leash common-tools catalog + approval policy helpers.
 * Product contract: docs/LEASH-COMMON-TOOLS-JULY-2026.md
 */

export type LeashToolRisk = 'low' | 'medium' | 'high' | 'highest';

export interface LeashCommonToolDef {
  id: string;
  label: string;
  description: string;
  risk: LeashToolRisk;
  /** Hermes gateway toolset names this row covers. */
  gatewayToolsets: string[];
  /** Extra tool-name substrings (e.g. git via terminal). */
  matchHints?: string[];
  builtin: true;
}

export interface LeashCustomToolDef {
  id: string;
  label: string;
  description?: string;
  builtin?: false;
}

export type LeashToolRow = LeashCommonToolDef | (LeashCustomToolDef & { risk?: LeashToolRisk });

/** July 2026 Leash essentials — default ON (Igor product lock). */
export const LEASH_COMMON_TOOLS: readonly LeashCommonToolDef[] = [
  {
    id: 'web',
    label: 'Web search',
    description: 'Search and extract pages from the internet',
    risk: 'medium',
    gatewayToolsets: ['web'],
    matchHints: ['web_search', 'web_extract'],
    builtin: true,
  },
  {
    id: 'browser',
    label: 'Browser use',
    description: 'Navigate, click, and type in a browser on your Mac',
    risk: 'high',
    gatewayToolsets: ['browser'],
    matchHints: ['browser_'],
    builtin: true,
  },
  {
    id: 'terminal',
    label: 'Shell / terminal',
    description: 'Run shell commands on your Mac',
    risk: 'high',
    gatewayToolsets: ['terminal'],
    matchHints: ['terminal', 'process', 'run_command', 'bash', 'zsh', 'sh '],
    builtin: true,
  },
  {
    id: 'git',
    label: 'Git commands',
    description: 'git status, commit, push, and related shell git calls',
    risk: 'high',
    gatewayToolsets: ['terminal'],
    matchHints: ['git ', 'git_', 'gitstatus'],
    builtin: true,
  },
  {
    id: 'file',
    label: 'Files',
    description: 'Read, write, patch, and search files on your Mac',
    risk: 'high',
    gatewayToolsets: ['file'],
    matchHints: ['read_file', 'write_file', 'patch', 'search_files'],
    builtin: true,
  },
  {
    id: 'code_execution',
    label: 'Code execution',
    description: 'Run code on your Mac',
    risk: 'high',
    gatewayToolsets: ['code_execution'],
    matchHints: ['execute_code', 'code_execution'],
    builtin: true,
  },
  {
    id: 'computer_use',
    label: 'Computer use',
    description: 'Control the desktop GUI on your Mac',
    risk: 'highest',
    gatewayToolsets: ['computer_use'],
    matchHints: ['computer_use', 'cua'],
    builtin: true,
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'List and use Mac skills from chat',
    risk: 'medium',
    gatewayToolsets: ['skills'],
    matchHints: ['skill_'],
    builtin: true,
  },
  {
    id: 'cronjob',
    label: 'Scheduled jobs',
    description: 'Create and manage recurring Mac jobs',
    risk: 'medium',
    gatewayToolsets: ['cronjob'],
    matchHints: ['cron'],
    builtin: true,
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'Remember facts across chats',
    risk: 'low',
    gatewayToolsets: ['memory'],
    matchHints: ['memory'],
    builtin: true,
  },
  {
    id: 'todo',
    label: 'Todos',
    description: 'Plan and track tasks',
    risk: 'low',
    gatewayToolsets: ['todo'],
    matchHints: ['todo'],
    builtin: true,
  },
  {
    id: 'clarify',
    label: 'Clarify',
    description: 'Ask you clarifying questions mid-run',
    risk: 'low',
    gatewayToolsets: ['clarify'],
    matchHints: ['clarify'],
    builtin: true,
  },
  {
    id: 'delegation',
    label: 'Delegation',
    description: 'Spawn sub-agents for work',
    risk: 'medium',
    gatewayToolsets: ['delegation'],
    matchHints: ['delegate'],
    builtin: true,
  },
  {
    id: 'session_search',
    label: 'Session search',
    description: 'Search past conversations',
    risk: 'low',
    gatewayToolsets: ['session_search'],
    matchHints: ['session_search'],
    builtin: true,
  },
] as const;

const BUILTIN_BY_ID = new Map(LEASH_COMMON_TOOLS.map((tool) => [tool.id, tool]));

export function normalizeLeashToolId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function isLeashToolEnabled(
  toolId: string,
  approvalRequiredIds: readonly string[] | undefined,
): boolean {
  if (!approvalRequiredIds || approvalRequiredIds.length === 0) {
    return true;
  }
  return !approvalRequiredIds.includes(toolId);
}

export function setLeashToolEnabled(
  toolId: string,
  enabled: boolean,
  approvalRequiredIds: readonly string[] | undefined,
): string[] {
  const current = [...(approvalRequiredIds ?? [])];
  const idx = current.indexOf(toolId);
  if (enabled) {
    if (idx >= 0) {
      current.splice(idx, 1);
    }
    return current;
  }
  if (idx < 0) {
    current.push(toolId);
  }
  return current;
}

export function mergeLeashToolRows(
  customTools: readonly LeashCustomToolDef[] | undefined,
): LeashToolRow[] {
  const customs = (customTools ?? []).filter((tool) => tool.id && tool.label);
  return [...LEASH_COMMON_TOOLS, ...customs];
}

function haystackForPending(toolName: string, command?: string): string {
  return `${toolName} ${command ?? ''}`.toLowerCase();
}

/**
 * True when this gateway tool/command matches a Leash row the user disabled
 * (requires approve/deny).
 */
export function toolAttemptRequiresLeashApproval(
  toolName: string,
  options: {
    approvalRequiredIds?: readonly string[];
    customTools?: readonly LeashCustomToolDef[];
    command?: string;
  } = {},
): { required: boolean; toolId?: string; label?: string } {
  const requiredIds = options.approvalRequiredIds ?? [];
  if (requiredIds.length === 0) {
    return { required: false };
  }

  const commandHay = (options.command ?? '').toLowerCase();
  const toolHay = toolName.toLowerCase();
  const haystack = `${toolHay} ${commandHay}`.trim();
  const rows = mergeLeashToolRows(options.customTools);
  const requiredSet = new Set(requiredIds);

  type Scored = { toolId: string; label: string; score: number };
  const scored: Scored[] = [];

  for (const row of rows) {
    if (!requiredSet.has(row.id)) {
      continue;
    }

    if ('gatewayToolsets' in row && row.builtin) {
      const hints = row.matchHints ?? [];
      const commandHint = hints.find((hint) => commandHay.includes(hint.toLowerCase()));
      const toolHint = hints.find((hint) => toolHay.includes(hint.toLowerCase()));
      const toolsetsHit = row.gatewayToolsets.some(
        (name) =>
          toolHay === name.toLowerCase() || toolHay.includes(name.toLowerCase()),
      );
      if (!commandHint && !toolHint && !toolsetsHit) {
        continue;
      }
      // Prefer hints that appear in the command string (e.g. git) over
      // broad tool-name matches (run_command → terminal).
      let score = 10;
      if (commandHint) {
        score = 200 + commandHint.length;
      } else if (toolHint) {
        score = 100 + toolHint.length;
      }
      scored.push({ toolId: row.id, label: row.label, score });
      continue;
    }

    if (
      toolHay === row.id.toLowerCase() ||
      haystack.includes(row.id.toLowerCase()) ||
      haystack.includes(row.label.toLowerCase())
    ) {
      scored.push({ toolId: row.id, label: row.label, score: 50 });
    }
  }

  // Also allow raw custom ids that never made it into merge rows.
  for (const id of requiredIds) {
    if (scored.some((item) => item.toolId === id)) {
      continue;
    }
    if (haystack.includes(id.toLowerCase()) || toolName.toLowerCase() === id.toLowerCase()) {
      scored.push({ toolId: id, label: id, score: 20 });
    }
  }

  if (scored.length === 0) {
    return { required: false };
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { required: true, toolId: best.toolId, label: best.label };
}

export function annotatePendingReasonForDisabledTool(
  reason: string,
  match: { required: boolean; label?: string },
): string {
  if (!match.required || !match.label) {
    return reason;
  }
  const tag = `Disabled on Leash · ${match.label}`;
  if (reason.includes(tag)) {
    return reason;
  }
  return `${tag} — ${reason}`;
}

export function createLeashCustomTool(label: string, description?: string): LeashCustomToolDef | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }
  const id = normalizeLeashToolId(trimmed);
  if (!id) {
    return null;
  }
  if (BUILTIN_BY_ID.has(id)) {
    return null;
  }
  return {
    id: `custom_${id}`,
    label: trimmed,
    ...(description?.trim() ? { description: description.trim() } : {}),
  };
}

export function leashToolStatusLine(enabled: boolean): string {
  return enabled ? 'Allowed without prompt' : 'Requires approve/deny on Leash';
}
