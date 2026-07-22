import React from 'react';
import { render } from '@testing-library/react-native';
import FreshUserOnboardingCard from '../components/FreshUserOnboardingCard';

describe('FreshUserOnboardingCard', () => {
  it('renders numbered steps for unpaired users', () => {
    const { getByTestId, getByText } = render(
      <FreshUserOnboardingCard profiles={[]} tailscaleMacLabel="Igors-Mac-mini" />,
    );

    expect(getByTestId('fresh-user-onboarding-card')).toBeTruthy();
    expect(getByTestId('fresh-user-step-1')).toBeTruthy();
    expect(getByTestId('fresh-user-step-3')).toBeTruthy();
    expect(getByText('Connect your computer')).toBeTruthy();
    expect(getByText(/Find computers below/)).toBeTruthy();
    expect(getByText(/Igors-Mac-mini/)).toBeTruthy();
  });

  it('renders cellular-first steps when not on Wi-Fi', () => {
    const { getByText, queryByText } = render(
      <FreshUserOnboardingCard profiles={[]} wifiConnected={false} />,
    );

    expect(getByText('Use Tailscale from cellular')).toBeTruthy();
    expect(queryByText('Same home Wi‑Fi')).toBeNull();
  });

  it('keeps the card mounted when hideSteps collapses numbered steps', () => {
    const { getByTestId, queryByTestId } = render(
      <FreshUserOnboardingCard profiles={[]} hideSteps testID="connect-mac-onboarding-card" />,
    );

    expect(getByTestId('connect-mac-onboarding-card')).toBeTruthy();
    expect(getByTestId('fresh-user-onboarding-heading')).toBeTruthy();
    expect(queryByTestId('fresh-user-step-1')).toBeNull();
  });
});
