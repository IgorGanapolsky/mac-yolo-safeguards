import React from 'react';
import { render } from '@testing-library/react-native';
import ContinuingFromSessionChip from '../components/ContinuingFromSessionChip';

describe('ContinuingFromSessionChip', () => {
  it('never shows Continuing/Dismiss UI on the default resume path', () => {
    const { queryByTestId, queryByText } = render(
      <ContinuingFromSessionChip visible onDismiss={() => {}} />,
    );
    expect(queryByTestId('continuing-from-session-chip')).toBeNull();
    expect(queryByTestId('continuing-from-session-chip-dismiss')).toBeNull();
    expect(queryByText('Continuing from last session')).toBeNull();
    expect(queryByText('Dismiss')).toBeNull();
  });

  it('renders nothing when not visible', () => {
    const { queryByTestId, queryByText } = render(
      <ContinuingFromSessionChip visible={false} onDismiss={() => {}} />,
    );
    expect(queryByTestId('continuing-from-session-chip')).toBeNull();
    expect(queryByText('Continuing from last session')).toBeNull();
  });
});
