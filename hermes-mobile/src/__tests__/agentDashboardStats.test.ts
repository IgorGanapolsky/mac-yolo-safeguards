import {
  buildAgentDashboardStats,
  countActiveCronJobs,
  countToolsFromToolsets,
  resolveConnectionHealthLabel,
  resolveConnectionHealthSummary,
} from '../utils/agentDashboardStats';

describe('agentDashboardStats', () => {
  it('counts tools across toolsets', () => {
    expect(
      countToolsFromToolsets([
        { name: 'terminal', tools: ['run_command', 'read_file'] },
        { name: 'web', tools: ['web_search'] },
      ]),
    ).toBe(3);
  });

  it('counts active cron jobs', () => {
    expect(
      countActiveCronJobs([
        { id: '1', paused: false },
        { id: '2', paused: true },
        { id: '3', enabled: false },
      ]),
    ).toBe(1);
  });

  it('uses short plain status for the narrow dashboard column (never Computer linked)', () => {
    expect(
      resolveConnectionHealthLabel('connected', { level: 'green', checkedAt: 'x' }, true),
    ).toBe('Connected');
    // Must stay one short word — multi-word "Computer linked" ellipsizes to "Computer… / LINK".
    expect(resolveConnectionHealthLabel('connected', { level: 'green', checkedAt: 'x' }, true)).not.toMatch(
      /Computer|linked|Link/i,
    );
  });

  it('uses full plain English for the connection health hub', () => {
    expect(
      resolveConnectionHealthSummary('connected', { level: 'green', checkedAt: 'x' }, true),
    ).toBe('Your Mac is connected');
    expect(resolveConnectionHealthSummary('disconnected', { level: 'red', checkedAt: 'x' })).toBe(
      "Can't reach your Mac",
    );
  });

  it('labels auth mismatch', () => {
    expect(
      resolveConnectionHealthLabel('connected', {
        level: 'green',
        checkedAt: 'x',
        authMismatch: true,
      }),
    ).toBe('Re-pair');
  });

  it('builds dashboard stats snapshot', () => {
    const stats = buildAgentDashboardStats({
      toolsets: [{ name: 'terminal', tools: ['run_command'] }],
      skills: [{ name: 'mac-freeze-rescue' }],
      jobs: [{ id: 'j1' }, { id: 'j2', paused: true }],
      gatewayModel: 'qwen3:8b-64k',
      connectionState: 'connected',
      health: { level: 'green', checkedAt: 'x', hostname: 'mini.local' },
      macHttpReachable: true,
    });

    expect(stats.toolCount).toBe(1);
    expect(stats.skillCount).toBe(1);
    expect(stats.cronJobCount).toBe(2);
    expect(stats.gatewayModel).toBe('qwen3:8b-64k');
    expect(stats.connectionLabel).toBe('Connected');
    expect(stats.hostname).toBe('mini.local');
  });
});
