import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import type { VaultProjectCatalogEntry } from '../types/vaultProject';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import { isGenericSessionPlaceholderTitle } from '../utils/sessionDisplay';
import { workspaceDisplayName } from '../utils/workspacePrompt';

const STORAGE_KEY = 'hermes-mobile:chat_projects';

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, '');
}

function normalizeRepoPath(path: string): string {
  return normalizePath(path).replace(/^~(?=\/)/, '');
}

export function resolveActiveProjectId(
  state: ChatProjectState,
  computerProfileId?: string | null,
): string | null {
  const profileId = computerProfileId?.trim();
  if (profileId && state.activeProjectByComputer && profileId in state.activeProjectByComputer) {
    return state.activeProjectByComputer[profileId] ?? null;
  }
  return state.activeProjectId;
}

export function setActiveProjectForComputer(
  state: ChatProjectState,
  computerProfileId: string | null | undefined,
  projectId: string | null,
): ChatProjectState {
  const next: ChatProjectState = { ...state, activeProjectId: projectId };
  if (!computerProfileId?.trim()) {
    return next;
  }
  return {
    ...next,
    activeProjectByComputer: {
      ...(state.activeProjectByComputer ?? {}),
      [computerProfileId]: projectId,
    },
  };
}

export function createProject(workspacePath: string, name?: string): ChatProject {
  const normalized = normalizePath(workspacePath);
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: name?.trim() || workspaceDisplayName(normalized),
    workspacePath: normalized,
    sessionIds: [],
  };
}

export function createProjectFromVaultEntry(entry: VaultProjectCatalogEntry): ChatProject {
  const workspacePath = normalizePath(entry.sourceRepo);
  const id = `vault_${entry.slug}`;
  return {
    id,
    name: entry.name,
    workspacePath,
    vaultSlug: entry.slug,
    sourceRepo: entry.sourceRepo,
    role: entry.role,
    handoffSummary: entry.handoffSummary,
    sessionIds: [],
  };
}

function projectMatchesVaultEntry(project: ChatProject, entry: VaultProjectCatalogEntry): boolean {
  if (project.vaultSlug && project.vaultSlug === entry.slug) return true;
  if (project.id === `vault_${entry.slug}`) return true;
  return normalizeRepoPath(project.workspacePath) === normalizeRepoPath(entry.sourceRepo);
}

export function mergeVaultCatalogIntoState(
  state: ChatProjectState,
  entries: VaultProjectCatalogEntry[],
): ChatProjectState {
  if (entries.length === 0) return state;
  const projects = [...state.projects];
  for (const entry of entries) {
    const index = projects.findIndex((project) => projectMatchesVaultEntry(project, entry));
    if (index >= 0) {
      const existing = projects[index];
      projects[index] = {
        ...existing,
        name: entry.name || existing.name,
        workspacePath: normalizePath(entry.sourceRepo),
        vaultSlug: entry.slug,
        sourceRepo: entry.sourceRepo,
        role: entry.role ?? existing.role,
        handoffSummary: entry.handoffSummary ?? existing.handoffSummary,
      };
      continue;
    }
    projects.push(createProjectFromVaultEntry(entry));
  }
  return { ...state, projects };
}

export function bindSessionToProject(
  state: ChatProjectState,
  projectId: string,
  sessionId: string,
  sessionLabel?: string,
): ChatProjectState {
  const project = state.projects.find((p) => p.id === projectId);
  const projects = state.projects.map((entry) => {
    if (entry.id !== projectId) return entry;
    const sessionIds = [sessionId, ...entry.sessionIds.filter((id) => id !== sessionId)];
    return { ...entry, sessionIds, activeSessionId: sessionId };
  });
  const label =
    sessionLabel?.trim() ||
    state.sessionLabels[sessionId]?.trim() ||
    project?.name?.trim() ||
    undefined;
  const sessionLabels =
    label &&
    !isGenericSessionPlaceholderTitle(label) &&
    !state.sessionLabels[sessionId]
      ? { ...state.sessionLabels, [sessionId]: label }
      : state.sessionLabels;
  return {
    ...state,
    projects,
    sessionProjectMap: { ...state.sessionProjectMap, [sessionId]: projectId },
    sessionLabels,
    activeProjectId: projectId,
  };
}

export function projectNameForSession(
  state: ChatProjectState,
  sessionId: string,
): string | null {
  const projectId = state.sessionProjectMap[sessionId];
  if (!projectId) {
    return null;
  }
  return state.projects.find((p) => p.id === projectId)?.name ?? null;
}

export function pinSessionLabel(
  state: ChatProjectState,
  sessionId: string,
  label: string,
): ChatProjectState {
  const trimmed = label.trim();
  if (!trimmed || isGenericSessionPlaceholderTitle(trimmed) || state.sessionLabels[sessionId] === trimmed) {
    return state;
  }
  return {
    ...state,
    sessionLabels: { ...state.sessionLabels, [sessionId]: trimmed },
  };
}

export function setActiveProject(state: ChatProjectState, projectId: string): ChatProjectState {
  return { ...state, activeProjectId: projectId };
}

export function setActiveSession(
  state: ChatProjectState,
  projectId: string,
  sessionId: string,
): ChatProjectState {
  const projects = state.projects.map((project) =>
    project.id === projectId ? { ...project, activeSessionId: sessionId } : project,
  );
  return { ...state, projects, activeProjectId: projectId };
}

/** Drop session bindings/labels after gateway deletes (or clear-all). */
export function clearBoundSessions(
  state: ChatProjectState,
  removedSessionIds: Iterable<string>,
): ChatProjectState {
  const removed = new Set(removedSessionIds);
  if (removed.size === 0) {
    return state;
  }
  const projects = state.projects.map((project) => {
    const sessionIds = project.sessionIds.filter((id) => !removed.has(id));
    const activeSessionId =
      project.activeSessionId && !removed.has(project.activeSessionId)
        ? project.activeSessionId
        : undefined;
    return { ...project, sessionIds, activeSessionId };
  });
  const sessionProjectMap = { ...state.sessionProjectMap };
  const sessionLabels = { ...state.sessionLabels };
  for (const id of removed) {
    delete sessionProjectMap[id];
    delete sessionLabels[id];
  }
  return { ...state, projects, sessionProjectMap, sessionLabels };
}

/** Wipe every mobile session binding after clear-all (gateway deletes are separate). */
export function clearAllSessionBindings(state: ChatProjectState): ChatProjectState {
  const projects = state.projects.map((project) => ({
    ...project,
    sessionIds: [],
    activeSessionId: undefined,
  }));
  return {
    ...state,
    projects,
    sessionProjectMap: {},
    sessionLabels: {},
  };
}

export function sessionsForProject(state: ChatProjectState, projectId: string): string[] {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return [];
  return project.sessionIds;
}

export const chatProjects = {
  async load(): Promise<ChatProjectState> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY_CHAT_PROJECT_STATE };
      const parsed = JSON.parse(raw) as Partial<ChatProjectState>;
      const sessionProjectMap =
        parsed.sessionProjectMap && typeof parsed.sessionProjectMap === 'object'
          ? parsed.sessionProjectMap
          : {};
      const sessionLabels =
        parsed.sessionLabels && typeof parsed.sessionLabels === 'object'
          ? parsed.sessionLabels
          : {};
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      // Backfill pinned labels for sessions already bound to a project.
      const mergedLabels = { ...sessionLabels };
      for (const project of projects) {
        for (const sessionId of project.sessionIds) {
          if (!mergedLabels[sessionId]?.trim() && project.name?.trim()) {
            mergedLabels[sessionId] = project.name.trim();
          }
        }
      }
      for (const [sessionId, label] of Object.entries(mergedLabels)) {
        if (isGenericSessionPlaceholderTitle(label)) {
          delete mergedLabels[sessionId];
        }
      }
      return {
        projects,
        sessionProjectMap,
        sessionLabels: mergedLabels,
        activeProjectId: parsed.activeProjectId ?? null,
        activeProjectByComputer:
          parsed.activeProjectByComputer && typeof parsed.activeProjectByComputer === 'object'
            ? parsed.activeProjectByComputer
            : {},
        demoCleared: parsed.demoCleared ?? false,
      };
    } catch (error) {
      console.error('[hermes-mobile] chatProjects.load failed:', error);
      return { ...EMPTY_CHAT_PROJECT_STATE };
    }
  },

  async save(state: ChatProjectState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[hermes-mobile] chatProjects.save failed:', error);
    }
  },

  async addProject(workspacePath: string, name?: string): Promise<ChatProjectState> {
    const state = await this.load();
    const project = createProject(workspacePath, name);
    const next: ChatProjectState = {
      ...state,
      projects: [project, ...state.projects],
      activeProjectId: project.id,
    };
    await this.save(next);
    return next;
  },
};
