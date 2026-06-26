import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatProject, ChatProjectState } from '../types/chatProject';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import { isGenericSessionPlaceholderTitle } from '../utils/sessionDisplay';
import { workspaceDisplayName } from '../utils/workspacePrompt';

const STORAGE_KEY = 'hermes-mobile:chat_projects';

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, '');
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
      // Backfill pinned labels for sessions already bound to a project lane.
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
