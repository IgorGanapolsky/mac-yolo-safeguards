import React from 'react';
import { render } from '@testing-library/react-native';
import SubmittedPromptStrip from '../components/SubmittedPromptStrip';

describe('SubmittedPromptStrip', () => {
  const sentAt = '2026-07-09T23:42:00.000Z';

  it('does not duplicate the optimistic user bubble while a send is pending', () => {
    const { queryByTestId, queryByText } = render(
      <SubmittedPromptStrip text="run ls in workspace" sentAt={sentAt} status="pending" />,
    );
    expect(queryByTestId('submitted-prompt-strip')).toBeTruthy();
    expect(queryByText('You sent')).toBeNull();
    expect(queryByText('run ls in workspace')).toBeNull();
  });

  it('returns null for blank text', () => {
    const { queryByTestId } = render(
      <SubmittedPromptStrip text="   " status="sent" connectionState="demo" macHttpOk />,
    );
    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
  });

  it('does not add a second prompt copy when delivery is waiting for the Mac', () => {
    const { queryByTestId, queryByText } = render(
      <SubmittedPromptStrip
        text="Make money faster"
        sentAt={sentAt}
        status="sent"
        connectionState="connecting"
        macHttpOk={false}
      />,
    );
    expect(queryByTestId('submitted-prompt-strip')).toBeTruthy();
    expect(queryByText('Make money faster')).toBeNull();
  });
});
