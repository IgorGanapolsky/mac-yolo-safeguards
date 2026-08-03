import React from 'react';
import { render } from '@testing-library/react-native';
import AgentDashboardStrip from '../components/AgentDashboardStrip';
import type { AgentDashboardStats } from '../utils/agentDashboardStats';

const baseStats: AgentDashboardStats = {
  toolsetCount: 2,
  toolCount: 5,
  skillCount: 3,
  cronJobCount: 2,
  activeCronCount: 1,
  gatewayModel: 'qwen3:8b-64k',
  connectionLabel: 'Connected',
  hostname: 'Igors-Mac-mini.local',
};

describe('AgentDashboardStrip', () => {
  it('renders tool, cron, and skill counts', () => {
    const { getByTestId, getByText } = render(<AgentDashboardStrip stats={baseStats} />);

    expect(getByTestId('agent-dashboard-strip')).toBeTruthy();
    expect(getByTestId('agent-dashboard-tools').props.children[0].props.children).toBe(5);
    expect(getByTestId('agent-dashboard-runs').props.children[0].props.children).toBe(2);
    expect(getByTestId('agent-dashboard-skills').props.children[0].props.children).toBe(3);
    expect(getByText(/Model on computer: qwen3:8b-64k/)).toBeTruthy();
  });

  it('shows short Mac status — never Link label or ellipsized Computer… value', () => {
    const { getByTestId, getByText, queryByText } = render(
      <AgentDashboardStrip stats={baseStats} />,
    );
    const connection = getByTestId('agent-dashboard-connection');
    expect(connection).toBeTruthy();
    expect(getByText('Connected')).toBeTruthy();
    expect(getByText('Mac')).toBeTruthy();
    expect(queryByText('Link')).toBeNull();
    // Status value must stay a short word (Connected), not "Computer linked" → "Computer…"
    expect(connection.props.children[0].props.children).toBe('Connected');
    expect(connection.props.children[1].props.children).toBe('Mac');
  });

  it('shows active run label when provided', () => {
    const { getByTestId } = render(
      <AgentDashboardStrip stats={baseStats} activeRunLabel="Running web_search" />,
    );
    expect(getByTestId('agent-dashboard-active-run').props.children.join('')).toContain(
      'Running web_search',
    );
  });
});
