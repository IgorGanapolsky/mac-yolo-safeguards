import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatQuickActions, { type ChatQuickAction } from '../components/ChatQuickActions';

describe('ChatQuickActions', () => {
  const actions: ChatQuickAction[] = [
    {
      id: 'continue',
      label: 'Continue',
      detail: 'next step',
      prompt: 'continue with evidence',
    },
    {
      id: 'money',
      label: 'Money',
      detail: 'next dollar',
      prompt: 'run the next-dollar loop',
    },
  ];

  it('renders quick action chips and selects the matching prompt', () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <ChatQuickActions actions={actions} onSelect={onSelect} />,
    );

    expect(getByTestId('chat-quick-actions')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
    expect(getByText('next dollar')).toBeTruthy();

    fireEvent.press(getByTestId('chat-quick-action-money'));
    expect(onSelect).toHaveBeenCalledWith(actions[1]);
  });

  it('renders nothing without actions', () => {
    const { queryByTestId } = render(
      <ChatQuickActions actions={[]} onSelect={jest.fn()} />,
    );

    expect(queryByTestId('chat-quick-actions')).toBeNull();
  });

  it('calls onDismiss for dismissible chips', () => {
    const dismissible: ChatQuickAction[] = [
      {
        id: 'recent-0',
        label: 'print money, make money fas…',
        detail: 'recent prompt',
        prompt: 'print money, make money faster. Use Data Science, ML and Agentic RAG.',
        dismissible: true,
      },
    ];
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ChatQuickActions actions={dismissible} onSelect={jest.fn()} onDismiss={onDismiss} />,
    );

    fireEvent.press(getByTestId('chat-quick-action-dismiss-recent-0'));
    expect(onDismiss).toHaveBeenCalledWith(dismissible[0]);
  });
});
