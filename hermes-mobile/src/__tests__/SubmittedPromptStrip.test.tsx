import React from 'react';
import { render } from '@testing-library/react-native';
import SubmittedPromptStrip from '../components/SubmittedPromptStrip';

describe('SubmittedPromptStrip', () => {
  it('renders submitted text and pending status', () => {
    const { getByTestId, getByText } = render(
      <SubmittedPromptStrip text="run ls in workspace" status="pending" />,
    );
    expect(getByTestId('submitted-prompt-strip')).toBeTruthy();
    expect(getByText('You sent')).toBeTruthy();
    expect(getByText('run ls in workspace')).toBeTruthy();
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
        status="sent"
        connectionState="connecting"
        macHttpOk={false}
      />,
    );
    expect(getByText('○ Waiting for Mac…')).toBeTruthy();
  });
});
