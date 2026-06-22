import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatMessageBubble from '../components/ChatMessageBubble';

describe('ChatMessageBubble inline approval', () => {
  it('renders Approve and Deny on nudge bubbles', () => {
    const onApprove = jest.fn();
    const onDeny = jest.fn();
    const { getByTestId } = render(
      <ChatMessageBubble
        content="Reply exactly: APPROVE DEPLOY TRIAGE FIT"
        isUser={false}
        timeLabel="Jun 19, 2026 12:00 PM"
        inlineApproval={{
          title: 'Production deploy',
          onApprove,
          onDeny,
        }}
      />,
    );

    fireEvent.press(getByTestId('inline-approval-approve'));
    expect(onApprove).toHaveBeenCalled();

    fireEvent.press(getByTestId('inline-approval-deny'));
    expect(onDeny).toHaveBeenCalled();
  });
});
