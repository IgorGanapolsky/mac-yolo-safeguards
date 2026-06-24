import React from 'react';
import { render } from '@testing-library/react-native';
import HermesPersonaCard from '../components/HermesPersonaCard';

describe('HermesPersonaCard', () => {
  it('renders selected avatar, persona, and ready mood', () => {
    const { getByText, getByTestId } = render(
      <HermesPersonaCard
        persona="coach"
        avatar="bolt"
        motion={false}
        connectionState="connected"
      />,
    );

    expect(getByText('Hermes Coach')).toBeTruthy();
    expect(getByText('Encouraging, clear, momentum-focused.')).toBeTruthy();
    expect(getByTestId('hermes-avatar').props.children).toBe('⚡');
    expect(getByTestId('hermes-mood').props.children).toBe('Ready');
  });

  it('prioritizes approval mood over active run mood', () => {
    const { getByTestId } = render(
      <HermesPersonaCard
        persona="spark"
        avatar="navigator"
        motion={false}
        connectionState="connected"
        pendingApprovalCount={1}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 1000,
          detail: 'Running tools',
        }}
      />,
    );

    expect(getByTestId('hermes-mood').props.children).toBe('Needs approval');
  });

  it('shows ready when Mac is reachable over HTTP without live socket', () => {
    const { getByTestId } = render(
      <HermesPersonaCard
        persona="spark"
        avatar="navigator"
        motion={false}
        connectionState="disconnected"
        macHttpReachable
      />,
    );

    expect(getByTestId('hermes-mood').props.children).toBe('Ready');
  });
});
