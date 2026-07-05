import {
  attachHandoffsToProjects,
  parseProjectsReadmeTable,
  normalizeVaultProjectCatalog,
} from '../utils/vaultProjectCatalog';

const SAMPLE_README = `# Projects

## Project Homes

| Project | Start Here | Source Repo | Current Role |
| --- | --- | --- | --- |
| mac-yolo-safeguards | \`Projects/mac-yolo-safeguards/Start Here.md\` | \`/Users/igor/workspace/git/igor/mac-yolo-safeguards\` | Hermes/mobile/platform coordination |
| ThumbGate | \`Projects/ThumbGate/Start Here.md\` | \`/Users/igor/workspace/git/igor/ThumbGate/repo\` | Funnel/revenue product context |
`;

describe('vaultProjectCatalog', () => {
  it('parses Projects/README.md table rows', () => {
    const projects = parseProjectsReadmeTable(SAMPLE_README);
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      slug: 'mac-yolo-safeguards',
      name: 'mac-yolo-safeguards',
      sourceRepo: '/Users/igor/workspace/git/igor/mac-yolo-safeguards',
      role: 'Hermes/mobile/platform coordination',
    });
  });

  it('attaches latest handoff summary by project slug', () => {
    const projects = parseProjectsReadmeTable(SAMPLE_README);
    const merged = attachHandoffsToProjects(projects, [
      {
        path: 'Handoffs/2026-07-05-mac-yolo-safeguards-coordination.md',
        title: 'Coordination handoff',
        summary: 'Cursor owns mobile UX recovery.',
        project: 'mac-yolo-safeguards',
        date: '2026-07-05',
      },
    ]);
    expect(merged[0].handoffSummary).toContain('mobile UX');
  });

  it('normalizes pair-server catalog payloads', () => {
    const catalog = normalizeVaultProjectCatalog({
      schema: 'hermes-vault-projects/v1',
      generatedAt: '2026-07-05T00:00:00.000Z',
      vaultPath: '/Users/igor/Documents/AI-Agent-Sync',
      projects: [
        {
          slug: 'ThumbGate',
          name: 'ThumbGate',
          startHerePath: 'Projects/ThumbGate/Start Here.md',
          sourceRepo: '/Users/igor/workspace/git/igor/ThumbGate/repo',
        },
      ],
    });
    expect(catalog?.projects).toHaveLength(1);
  });
});
