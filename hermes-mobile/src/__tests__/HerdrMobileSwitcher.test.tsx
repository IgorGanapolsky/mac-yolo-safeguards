import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HerdrMobileSwitcher, getStateDotColor } from '../components/HerdrMobileSwitcher';

describe('HerdrMobileSwitcher component', () => {
  const mockWorkspaces = [
    {
      id: 'w1',
      name: 'mac-yolo-safeguards',
      tabCount: 2,
      activeBranch: 'master',
      agents: [{ id: 'a1', name: 'claude', kind: 'claude', state: 'working' as const, workspaceId: 'w1', tabId: 't1', paneId: 'p1' }],
    },
    {
      id: 'w2',
      name: 'hermes-control-plane',
      tabCount: 1,
      activeBranch: 'main',
      agents: [{ id: 'a2', name: 'gemini', kind: 'gemini', state: 'done' as const, workspaceId: 'w2', tabId: 't1', paneId: 'p1' }],
    },
  ];

  it('maps agent states to correct dot colors', () => {
    expect(getStateDotColor('working')).toBe('#eab308');
    expect(getStateDotColor('done')).toBe('#22c55e');
    expect(getStateDotColor('blocked')).toBe('#ef4444');
  });

  it('renders workspaces and handles selection taps', () => {
    const onSelect = jest.fn();
    const { getByText, getByTestId } = render(
      <HerdrMobileSwitcher
        workspaces={mockWorkspaces}
        activeWorkspaceId="w1"
        onSelectWorkspace={onSelect}
      />
    );

    expect(getByText('mac-yolo-safeguards')).toBeTruthy();
    expect(getByText('hermes-control-plane')).toBeTruthy();

    fireEvent.press(getByTestId('ws-row-w2'));
    expect(onSelect).toHaveBeenCalledWith('w2');
  });
});
