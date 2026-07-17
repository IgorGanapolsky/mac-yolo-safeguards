import React from 'react';
import { render } from '@testing-library/react-native';
import HermesAvatarPresence from '../components/HermesAvatarPresence';

describe('HermesAvatarPresence', () => {
  it('renders the selected avatar emoji', () => {
    const { getByTestId } = render(<HermesAvatarPresence avatar="bolt" />);
    expect(getByTestId('hermes-avatar-presence-emoji').props.children).toBe('⚡');
  });

  it('pulses a halo when playful motion is active', () => {
    const { getByTestId, queryByTestId } = render(
      <HermesAvatarPresence avatar="guardian" playfulMotion active />,
    );
    expect(getByTestId('hermes-avatar-presence-halo')).toBeTruthy();
    expect(getByTestId('hermes-avatar-presence-emoji').props.children).toBe('◆');
    expect(queryByTestId('hermes-avatar-presence')).toBeTruthy();
  });

  it('skips the halo when animated presence is off', () => {
    const { queryByTestId } = render(
      <HermesAvatarPresence avatar="bolt" playfulMotion={false} active />,
    );
    expect(queryByTestId('hermes-avatar-presence-halo')).toBeNull();
  });

  it('skips the halo when presence is idle even if motion is on', () => {
    const { queryByTestId } = render(
      <HermesAvatarPresence avatar="navigator" playfulMotion active={false} />,
    );
    expect(queryByTestId('hermes-avatar-presence-halo')).toBeNull();
    expect(queryByTestId('hermes-avatar-presence-emoji')?.props.children).toBe('✦');
  });
});
