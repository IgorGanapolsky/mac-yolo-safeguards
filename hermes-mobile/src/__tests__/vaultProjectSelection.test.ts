import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import {
  applyAutoSelectedProject,
  formatThreadTitleWithProject,
  inferAutoSelectProjectId,
  normalizeRepoPath,
  projectsMatchingWorkspace,
  resolveComposerVaultStrip,
  shouldShowProjectPickNudge,
} from '../utils/vaultProjectSelection';
import { mergeVaultCatalogIntoState } from '../services/chatProjects';

describe('vaultProjectSelection', () => {
  it('normalizes repo paths for comparison', () => {
    expect(normalizeRepoPath('~/workspace/git/igor/mac-yolo-safeguards/')).toBe(
      '/workspace/git/igor/mac-yolo-safeguards',
    );
  });

  it('matches projects by workspace or source repo', () => {
    const state = mergeVaultCatalogIntoState(EMPTY_CHAT_PROJECT_STATE, [
      {
        slug: 'mac-yolo-safeguards',
        name: 'mac-yolo-safeguards',
        startHerePath: 'Projects/mac-yolo-safeguards/Start Here.md',
        sourceRepo: '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
      },
      {
        slug: 'ThumbGate',
        name: 'ThumbGate',
        startHerePath: 'Projects/ThumbGate/Start Here.md',
        sourceRepo: '/Users/igor/workspace/git/igor/ThumbGate',
      },
    ]);
    const matches = projectsMatchingWorkspace(state.projects, [
      '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.vaultSlug).toBe('mac-yolo-safeguards');
  });

  it('auto-selects when exactly one workspace match and none pinned', () => {
    const state = mergeVaultCatalogIntoState(EMPTY_CHAT_PROJECT_STATE, [
      {
        slug: 'mac-yolo-safeguards',
        name: 'mac-yolo-safeguards',
        startHerePath: 'Projects/mac-yolo-safeguards/Start Here.md',
        sourceRepo: '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
      },
      {
        slug: 'ThumbGate',
        name: 'ThumbGate',
        startHerePath: 'Projects/ThumbGate/Start Here.md',
        sourceRepo: '/Users/igor/workspace/git/igor/ThumbGate',
      },
    ]);
    const autoId = inferAutoSelectProjectId(state, 'mac_mini', [
      '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
    ]);
    expect(autoId).toBe('vault_mac-yolo-safeguards');
    const next = applyAutoSelectedProject(state, 'mac_mini', autoId!);
    expect(next.activeProjectByComputer?.mac_mini).toBe('vault_mac-yolo-safeguards');
  });

  it('does not auto-select when a project is already pinned for the computer', () => {
    const state = {
      ...mergeVaultCatalogIntoState(EMPTY_CHAT_PROJECT_STATE, [
        {
          slug: 'ThumbGate',
          name: 'ThumbGate',
          startHerePath: 'Projects/ThumbGate/Start Here.md',
          sourceRepo: '/Users/igor/workspace/git/igor/ThumbGate',
        },
      ]),
      activeProjectByComputer: { mac_mini: 'vault_ThumbGate' },
    };
    expect(
      inferAutoSelectProjectId(state, 'mac_mini', ['/Users/igor/workspace/git/igor/ThumbGate']),
    ).toBeNull();
  });

  it('prefixes thread titles with the active project lane', () => {
    expect(formatThreadTitleWithProject('New chat', 'mac-yolo-safeguards')).toBe(
      'mac-yolo-safeguards',
    );
    expect(formatThreadTitleWithProject('Deploy fix', 'ThumbGate')).toBe('ThumbGate · Deploy fix');
    expect(formatThreadTitleWithProject('ThumbGate · Deploy fix', 'ThumbGate')).toBe(
      'ThumbGate · Deploy fix',
    );
  });

  it('shows project pick nudge only with 2+ vault lanes and none selected', () => {
    expect(
      shouldShowProjectPickNudge({
        isDemo: false,
        macConnected: true,
        activeProjectId: null,
        vaultProjectCount: 2,
      }),
    ).toBe(true);
    expect(
      shouldShowProjectPickNudge({
        isDemo: false,
        macConnected: true,
        activeProjectId: null,
        vaultProjectCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowProjectPickNudge({
        isDemo: false,
        macConnected: true,
        activeProjectId: 'vault_a',
        vaultProjectCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldShowProjectPickNudge({
        isDemo: true,
        macConnected: true,
        activeProjectId: null,
        vaultProjectCount: 2,
      }),
    ).toBe(false);
  });

  it('shows composer nudge only when keyboard is closed and pick is needed', () => {
    expect(
      resolveComposerVaultStrip({
        keyboardOpen: true,
        showProjectPickNudge: true,
      }),
    ).toEqual({ showNudge: false });

    expect(
      resolveComposerVaultStrip({
        keyboardOpen: false,
        showProjectPickNudge: true,
      }),
    ).toEqual({ showNudge: true });

    expect(
      resolveComposerVaultStrip({
        keyboardOpen: false,
        showProjectPickNudge: false,
      }),
    ).toEqual({ showNudge: false });
  });
});
