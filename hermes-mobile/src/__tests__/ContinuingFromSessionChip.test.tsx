import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ContinuingFromSessionChip from '../components/ContinuingFromSessionChip';
import { CONTINUITY_CHIP_AUTO_DISMISS_MS } from '../utils/sessionContinuityHandoff';

describe('ContinuingFromSessionChip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when not visible (seamless default)', () => {
    const { queryByTestId, queryByText } = render(
      <ContinuingFromSessionChip visible={false} onDismiss={() => {}} />,
    );
    expect(queryByTestId('continuing-from-session-chip')).toBeNull();
    expect(queryByText('Continuing from last session')).toBeNull();
  });

  it('auto-dismisses after the ephemeral window without requiring Dismiss tap', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ContinuingFromSessionChip
        visible
        onDismiss={onDismiss}
        autoDismissMs={CONTINUITY_CHIP_AUTO_DISMISS_MS}
      />,
    );
    expect(getByTestId('continuing-from-session-chip')).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(CONTINUITY_CHIP_AUTO_DISMISS_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(CONTINUITY_CHIP_AUTO_DISMISS_MS).toBeLessThanOrEqual(3000);
  });

  it('Dismiss tap still works before the timer fires', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ContinuingFromSessionChip visible onDismiss={onDismiss} />,
    );
    fireEvent.press(getByTestId('continuing-from-session-chip-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
