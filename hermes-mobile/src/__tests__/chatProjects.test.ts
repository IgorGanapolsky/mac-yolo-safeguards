import {
  buildMobileChatSystemPrompt,
  buildWorkspaceSystemPrompt,
  workspaceDisplayName,
} from '../utils/workspacePrompt';
import { bindSessionToProject, clearAllSessionBindings, clearBoundSessions, createProject, pinSessionLabel } from '../services/chatProjects';

describe('workspacePrompt', () => {
  it('derives display name from path', () => {
    expect(workspaceDisplayName('/Users/igor/workspace/git/igor/ThumbGate')).toBe('ThumbGate');
  });

  it('pins workspace and vault lane in system prompt', () => {
    const prompt = buildWorkspaceSystemPrompt('~/workspace/git/igor/skool_top1percent', {
      vaultSlug: 'Skool',
      handoffSummary: 'Post the triple-offer thread.',
    });
    expect(prompt).toContain('skool_top1percent');
    expect(prompt).toContain('AI-Agent-Sync/Projects/Skool/');
    expect(prompt).toContain('triple-offer');
    expect(prompt).toContain('HARD CONSTRAINT');
    expect(prompt).toContain('OUT OF SCOPE');
  });

  it('forbids cross-repo wander when mac-yolo lane is active', () => {
    const prompt = buildWorkspaceSystemPrompt(
      '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
    );
    expect(prompt).toContain('mac-yolo-safeguards');
    expect(prompt).toContain('skool_top1percent');
    expect(prompt).toMatch(/Do not cd into/i);
  });

  it('always includes mobile execution mandate even without a project', () => {
    const prompt = buildMobileChatSystemPrompt();
    expect(prompt).toContain('Do not refuse');
    expect(prompt).toContain('next reversible action');
    expect(prompt).not.toContain('Active workspace');
  });

  it('merges execution mandate with workspace when project is set', () => {
    const prompt = buildMobileChatSystemPrompt('~/workspace/git/igor/skool_top1percent');
    expect(prompt).toContain('Do not refuse');
    expect(prompt).toContain('skool_top1percent');
  });
});

describe('chatProjects', () => {
  it('creates project with basename default name', () => {
    const project = createProject('~/workspace/git/igor/ThumbGate');
    expect(project.name).toBe('ThumbGate');
    expect(project.workspacePath).toBe('~/workspace/git/igor/ThumbGate');
  });

  it('binds sessions to a project lane', () => {
    const project = createProject('/tmp/foo');
    const state = bindSessionToProject(
      { projects: [project], sessionProjectMap: {}, sessionLabels: {}, activeProjectId: null },
      project.id,
      'sess_abc',
    );
    expect(state.projects[0].sessionIds).toEqual(['sess_abc']);
    expect(state.sessionProjectMap.sess_abc).toBe(project.id);
    expect(state.sessionLabels.sess_abc).toBe('foo');
    expect(state.activeProjectId).toBe(project.id);
  });

  it('does not pin generic placeholder session labels', () => {
    const base = { projects: [], sessionProjectMap: {}, sessionLabels: {}, activeProjectId: null };
    const next = pinSessionLabel(base, 'sess_abc', 'New mobile session');
    expect(next.sessionLabels).toEqual({});
  });

  it('clears bound session ids, maps, and labels', () => {
    const project = createProject('/tmp/foo');
    const bound = bindSessionToProject(
      { projects: [project], sessionProjectMap: {}, sessionLabels: {}, activeProjectId: null },
      project.id,
      'sess_abc',
    );
    const cleared = clearBoundSessions(bound, ['sess_abc']);
    expect(cleared.projects[0].sessionIds).toEqual([]);
    expect(cleared.projects[0].activeSessionId).toBeUndefined();
    expect(cleared.sessionProjectMap).toEqual({});
    expect(cleared.sessionLabels).toEqual({});
  });

  it('clears every project binding on clear-all', () => {
    const projectA = createProject('/tmp/foo');
    const projectB = createProject('/tmp/bar');
    let state = bindSessionToProject(
      { projects: [projectA, projectB], sessionProjectMap: {}, sessionLabels: {}, activeProjectId: null },
      projectA.id,
      'sess_a',
    );
    state = bindSessionToProject(state, projectB.id, 'sess_b');
    state = pinSessionLabel(state, 'sess_a', 'Alpha thread');
    const cleared = clearAllSessionBindings(state);
    expect(cleared.projects.every((project) => project.sessionIds.length === 0)).toBe(true);
    expect(cleared.sessionProjectMap).toEqual({});
    expect(cleared.sessionLabels).toEqual({});
  });
});
