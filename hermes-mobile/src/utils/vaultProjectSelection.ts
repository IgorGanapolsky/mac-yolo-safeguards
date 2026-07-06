import type { ChatProject, ChatProjectState } from '../types/chatProject';
import { resolveActiveProjectId, setActiveProjectForComputer } from '../services/chatProjects';

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, '').toLowerCase();
}

export function normalizeRepoPath(path: string): string {
  return normalizePath(path).replace(/^~(?=\/)/, '');
}

function projectWorkspaceKeys(project: ChatProject): string[] {
  const keys = new Set<string>();
  const workspace = normalizeRepoPath(project.workspacePath);
  if (workspace) keys.add(workspace);
  if (project.sourceRepo) {
    const source = normalizeRepoPath(project.sourceRepo);
    if (source) keys.add(source);
  }
  return [...keys];
}

function pathsMatch(a: string, b: string): boolean {
  const left = normalizeRepoPath(a);
  const right = normalizeRepoPath(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

/** Projects whose workspace/source repo matches any candidate path. */
export function projectsMatchingWorkspace(
  projects: ChatProject[],
  workspaceCandidates: string[],
): ChatProject[] {
  const candidates = workspaceCandidates
    .map((path) => normalizeRepoPath(path))
    .filter(Boolean);
  if (candidates.length === 0) return [];
  const matches = new Set<string>();
  for (const project of projects) {
    for (const key of projectWorkspaceKeys(project)) {
      if (candidates.some((candidate) => pathsMatch(key, candidate))) {
        matches.add(project.id);
        break;
      }
    }
  }
  return projects.filter((project) => matches.has(project.id));
}

/**
 * When no project is pinned for this computer, auto-select if exactly one
 * vault lane matches a known workspace path from the gateway catalog.
 */
export function inferAutoSelectProjectId(
  state: ChatProjectState,
  computerProfileId: string | null | undefined,
  workspaceCandidates: string[],
): string | null {
  if (resolveActiveProjectId(state, computerProfileId)) {
    return null;
  }
  const matches = projectsMatchingWorkspace(state.projects, workspaceCandidates);
  if (matches.length === 1) {
    return matches[0]!.id;
  }
  return null;
}

export function applyAutoSelectedProject(
  state: ChatProjectState,
  computerProfileId: string | null | undefined,
  projectId: string,
): ChatProjectState {
  return setActiveProjectForComputer(state, computerProfileId, projectId);
}

/** Prefix thread title with the active project for at-a-glance context. */
export function formatThreadTitleWithProject(
  baseTitle: string,
  projectName?: string | null,
): string {
  const name = projectName?.trim();
  if (!name) return baseTitle;
  if (baseTitle === 'New chat') return name;
  const prefix = `${name} · `;
  if (baseTitle.startsWith(prefix)) return baseTitle;
  return `${prefix}${baseTitle}`;
}

export function shouldShowProjectPickNudge(input: {
  isDemo: boolean;
  macConnected: boolean;
  activeProjectId: string | null | undefined;
  vaultProjectCount: number;
}): boolean {
  if (input.isDemo || !input.macConnected) return false;
  if (input.activeProjectId) return false;
  return input.vaultProjectCount >= 2;
}

/** Optional one-time nudge above composer when no lane is picked; header is the primary switcher. */
export function resolveComposerVaultStrip(input: {
  keyboardOpen: boolean;
  showProjectPickNudge: boolean;
}): { showNudge: boolean } {
  if (input.keyboardOpen) {
    return { showNudge: false };
  }
  return { showNudge: input.showProjectPickNudge };
}
