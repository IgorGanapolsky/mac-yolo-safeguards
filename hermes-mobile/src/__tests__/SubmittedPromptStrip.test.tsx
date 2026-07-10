import React from 'react';
import { render } from '@testing-library/react-native';
import SubmittedPromptStrip from '../components/SubmittedPromptStrip';
import { formatMessageTimestamp } from '../utils/chatMessageDisplay';

describe('SubmittedPromptStrip', () => {
  const sentAt = '2026-07-09T23:42:00.000Z';

  it('renders submitted text, send timestamp, and pending status', () => {
    const { getByTestId, getByText } = render(
      <SubmittedPromptStrip text="run ls in workspace" sentAt={sentAt} status="pending" />,
    );
    expect(getByTestId('submitted-prompt-strip')).toBeTruthy();
    expect(getByText('You sent')).toBeTruthy();
    expect(getByText('run ls in workspace')).toBeTruthy();
    expect(getByText(formatMessageTimestamp(sentAt))).toBeTruthy();
    expect(getByTestId('submitted-prompt-timestamp')).toBeTruthy();
    expect(getByText('○ Sending')).toBeTruthy();
  });

  it('returns null for blank text', () => {
    const { queryByTestId } = render(
      <SubmittedPromptStrip text="   " status="sent" connectionState="demo" macHttpOk />,
    );
    expect(queryByTestId('submitted-prompt-strip')).toBeNull();
  });

  it('shows waiting for Mac when sent but gateway unreachable', () => {
    const { getByText } = render(
      <SubmittedPromptStrip
        text="Make money faster"
        sentAt={sentAt}
        status="sent"
        connectionState="connecting"
        macHttpOk={false}
      />,
    );
    expect(getByText('○ Waiting for computer…')).toBeTruthy();
    expect(getByText(formatMessageTimestamp(sentAt))).toBeTruthy();
  });
});
