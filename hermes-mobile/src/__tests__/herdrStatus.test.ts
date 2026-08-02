import {
  parseHerdrAgentsResponse,
  buildHerdrSessionSummary,
} from '../services/herdrStatus';

describe('herdrStatus service', () => {
  it('parses raw Herdr agent list responses correctly', () => {
    const rawData = [
      {
        id: 'agent-1',
        name: 'claude',
        kind: 'claude-code',
        state: 'working',
        workspace_id: 'w1',
        tab_id: 'w1:t1',
        pane_id: 'w1:p1',
      },
      {
        id: 'agent-2',
        name: 'gemini',
        kind: 'gemini-cli',
        state: 'blocked',
        workspace_id: 'w1',
        tab_id: 'w1:t2',
        pane_id: 'w1:p2',
      },
    ];

    const agents = parseHerdrAgentsResponse(rawData);
    expect(agents).toHaveLength(2);
    expect(agents[0].state).toBe('working');
    expect(agents[1].state).toBe('blocked');
  });

  it('builds clear summary text for active agents', () => {
    const agents = parseHerdrAgentsResponse([
      { id: '1', state: 'working' },
      { id: '2', state: 'blocked' },
      { id: '3', state: 'done' },
    ]);

    const summary = buildHerdrSessionSummary(agents, true);
    expect(summary.connected).toBe(true);
    expect(summary.workingCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.doneCount).toBe(1);
    expect(summary.summaryText).toBe('1 working · 1 blocked · 1 done');
  });

  it('handles offline session state cleanly', () => {
    const summary = buildHerdrSessionSummary([], false);
    expect(summary.connected).toBe(false);
    expect(summary.summaryText).toBe('Herdr multiplexer offline');
  });
});
