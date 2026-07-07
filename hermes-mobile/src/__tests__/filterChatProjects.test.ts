import { filterChatProjects } from '../utils/filterChatProjects';
import type { ChatProject } from '../types/chatProject';

const base = (overrides: Partial<ChatProject>): ChatProject => ({
  id: 'id',
  name: 'Name',
  workspacePath: '~/workspace/git/igor/foo',
  sessionIds: [],
  ...overrides,
});

describe('filterChatProjects', () => {
  const projects: ChatProject[] = [
    base({ id: 'b', name: 'Beta', workspacePath: '~/projects/beta-app' }),
    base({
      id: 'a',
      name: 'Alpha',
      workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
      role: 'Mobile product',
      vaultSlug: 'hermes-mobile',
    }),
  ];

  it('sorts alphabetically when query is empty', () => {
    expect(filterChatProjects(projects, '').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('matches project name', () => {
    expect(filterChatProjects(projects, 'beta').map((p) => p.id)).toEqual(['b']);
  });

  it('matches workspace path segment', () => {
    expect(filterChatProjects(projects, 'mac-yolo').map((p) => p.id)).toEqual(['a']);
  });

  it('matches vault slug and role', () => {
    expect(filterChatProjects(projects, 'hermes-mobile').map((p) => p.id)).toEqual(['a']);
    expect(filterChatProjects(projects, 'mobile product').map((p) => p.id)).toEqual(['a']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterChatProjects(projects, 'zzzz-not-found')).toEqual([]);
  });
});
