import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ComposerErrorBanner from '../components/ComposerErrorBanner';

const HEALTH_PROBE_MESSAGE =
  'Still checking your computer link. Message kept locally.';

describe('ComposerErrorBanner', () => {
  it('renders the full health-probe message without line clamping', () => {
    const { getByTestId, getByText } = render(
      <ComposerErrorBanner message={HEALTH_PROBE_MESSAGE} onDismiss={jest.fn()} />,
    );

    const text = getByTestId('composer-error-banner-text');
    expect(getByText(HEALTH_PROBE_MESSAGE)).toBeTruthy();
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.style).toMatchObject({ lineHeight: 18, flexShrink: 1 });
  });

  it('uses flex-start alignment so wrapped lines are not vertically clipped', () => {
    const { getByTestId } = render(
      <ComposerErrorBanner message={HEALTH_PROBE_MESSAGE} onDismiss={jest.fn()} />,
    );

    expect(getByTestId('chat-operational-error').props.style).toMatchObject({
      alignItems: 'flex-start',
      paddingVertical: 10,
    });
  });

  it('dismisses when close is pressed', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <ComposerErrorBanner message="Send failed" onDismiss={onDismiss} />,
    );

    fireEvent.press(getByLabelText('Dismiss error'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('invokes onAction when the banner body is pressed (tap-to-retry)', () => {
    const onAction = jest.fn();
    const { getByTestId } = render(
      <ComposerErrorBanner
        message="Your computer finished but no reply text arrived — tap to retry."
        onDismiss={jest.fn()}
        actionLabel="Retry send"
        onAction={onAction}
      />,
    );

    fireEvent.press(getByTestId('composer-error-banner-action-area'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('rewrites bare Aborted to human Mac retry copy', () => {
    const { getByTestId, queryByText } = render(
      <ComposerErrorBanner message="Aborted" onDismiss={jest.fn()} />,
    );

    expect(getByTestId('composer-error-banner-text').props.children).toBe(
      "Couldn't finish on your Mac — tap to retry",
    );
    expect(queryByText('Aborted')).toBeNull();
  });
});
