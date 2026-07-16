import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ContinuingFromSessionChip from '../components/ContinuingFromSessionChip';

describe('ContinuingFromSessionChip', () => {
  it('renders nothing when not visible', () => {
    const { queryByTestId } = render(
      <ContinuingFromSessionChip visible={false} onDismiss={() => {}} />,
    );
    expect(queryByTestId('continuing-from-session-chip')).toBeNull();
  });

  it('shows continuing label and dismisses', () => {
    const onDismiss = jest.fn();
    const { getByTestId, getByText } = render(
      <ContinuingFromSessionChip visible onDismiss={onDismiss} />,
    );
    expect(getByTestId('continuing-from-session-chip')).toBeTruthy();
    expect(getByText('Continuing from last session')).toBeTruthy();
    fireEvent.press(getByTestId('continuing-from-session-chip-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
