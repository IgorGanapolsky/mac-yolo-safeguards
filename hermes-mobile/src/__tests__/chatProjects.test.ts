import {
  buildMobileChatSystemPrompt,
  buildWorkspaceSystemPrompt,
  workspaceDisplayName,
} from '../utils/workspacePrompt';
import { bindSessionToProject, createProject } from '../services/chatProjects';

describe('workspacePrompt', () => {
  it('derives display name from path', () => {
    expect(workspaceDisplayName('/Users/igor/workspace/git/igor/ThumbGate')).toBe('ThumbGate');
  });

  it('pins workspace in system prompt', () => {
    const prompt = buildWorkspaceSystemPrompt('~/workspace/git/igor/skool_top1percent');
    expect(prompt).toContain('skool_top1percent');
    expect(prompt).toContain('Active workspace');
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
});
