import {
  createProjectFromVaultEntry,
  mergeVaultCatalogIntoState,
  resolveActiveProjectId,
  setActiveProjectForComputer,
} from '../services/chatProjects';
import { fetchVaultProjectCatalogFromHost } from '../services/vaultProjects';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';

describe('vaultProjects integration helpers', () => {
  it('resolves active project per computer profile', () => {
    const state = {
      ...EMPTY_CHAT_PROJECT_STATE,
      projects: [
        { id: 'vault_a', name: 'A', workspacePath: '/a', sessionIds: [] },
        { id: 'vault_b', name: 'B', workspacePath: '/b', sessionIds: [] },
      ],
      activeProjectByComputer: {
        mac_a: 'vault_a',
        mac_b: 'vault_b',
      },
    };
    expect(resolveActiveProjectId(state, 'mac_b')).toBe('vault_b');
  });

  it('merges vault catalog entries into local project lanes', () => {
    const entry = {
      slug: 'mac-yolo-safeguards',
      name: 'mac-yolo-safeguards',
      startHerePath: 'Projects/mac-yolo-safeguards/Start Here.md',
      sourceRepo: '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
      role: 'platform',
      handoffSummary: 'Read plan.md before editing.',
    };
    const merged = mergeVaultCatalogIntoState(EMPTY_CHAT_PROJECT_STATE, [entry]);
    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0]).toMatchObject({
      id: 'vault_mac-yolo-safeguards',
      vaultSlug: 'mac-yolo-safeguards',
      handoffSummary: 'Read plan.md before editing.',
    });
    const project = createProjectFromVaultEntry(entry);
    expect(project.workspacePath).toBe('/Users/igor/workspace/git/igor/mac-yolo-safeguards');
  });

  it('persists computer-specific active project selection', () => {
    const withProject = mergeVaultCatalogIntoState(EMPTY_CHAT_PROJECT_STATE, [
      {
        slug: 'ThumbGate',
        name: 'ThumbGate',
        startHerePath: 'Projects/ThumbGate/Start Here.md',
        sourceRepo: '/Users/igor/workspace/git/igor/ThumbGate/repo',
      },
    ]);
    const next = setActiveProjectForComputer(withProject, 'mac_mini', 'vault_ThumbGate');
    expect(next.activeProjectId).toBe('vault_ThumbGate');
    expect(next.activeProjectByComputer?.mac_mini).toBe('vault_ThumbGate');
  });
});

describe('fetchVaultProjectCatalogFromHost', () => {
  it('returns null when pair server has no catalog', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await expect(fetchVaultProjectCatalogFromHost('192.168.1.10')).resolves.toBeNull();
  });

  it('parses catalog JSON from pair server', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schema: 'hermes-vault-projects/v1',
        generatedAt: '2026-07-05T00:00:00.000Z',
        vaultPath: '/Users/igor/Documents/AI-Agent-Sync',
        projects: [
          {
            slug: 'mac-yolo-safeguards',
            name: 'mac-yolo-safeguards',
            startHerePath: 'Projects/mac-yolo-safeguards/Start Here.md',
            sourceRepo: '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
          },
        ],
      }),
    });
    const catalog = await fetchVaultProjectCatalogFromHost('127.0.0.1');
    expect(catalog?.projects).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/vault-projects.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
