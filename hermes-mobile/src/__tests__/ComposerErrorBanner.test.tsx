import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ComposerErrorBanner from '../components/ComposerErrorBanner';

describe('ComposerErrorBanner', () => {
  it('fires onAction when Re-pair CTA is wired', () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ComposerErrorBanner
        message="Outdated connection for Igors-Mac-mini. Tap Re-pair this Mac to reconnect."
        onDismiss={onDismiss}
        actionLabel="Re-pair this Mac"
        onAction={onAction}
      />,
    );
    fireEvent.press(getByTestId('composer-error-banner-action-area'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not act when action is missing (dead tap regression)', () => {
    const onDismiss = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <ComposerErrorBanner
        message="Outdated connection for Igors-Mac-mini. Tap Re-pair this Mac to reconnect."
        onDismiss={onDismiss}
      />,
    );
    expect(queryByTestId('composer-error-banner-action-area')).toBeNull();
    expect(getByTestId('composer-error-banner-text')).toBeTruthy();
  });
});
