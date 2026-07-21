import React from 'react';
import { render } from '@testing-library/react-native';
import ChatEmptyGreeting, {
  greetingForTime,
  greetingSubtitle,
} from '../components/ChatEmptyGreeting';

describe('ChatEmptyGreeting', () => {
  it('picks morning greeting before noon', () => {
    expect(greetingForTime(new Date('2026-06-24T09:00:00'))).toBe('Good morning');
  });

  it('picks afternoon greeting before evening', () => {
    expect(greetingForTime(new Date('2026-06-24T14:00:00'))).toBe('Good afternoon');
  });

  it('picks evening greeting at night', () => {
    expect(greetingForTime(new Date('2026-06-24T20:00:00'))).toBe('Good evening');
  });

  it('renders disconnected copy without a specific machine', () => {
    const { getByTestId } = render(<ChatEmptyGreeting />);

    expect(getByTestId('chat-empty-greeting-title').props.children).toBeTruthy();
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything. Find computers or pick one above to connect — USB is optional.',
    );
  });

  it('prefers route labels for account-relay copy', () => {
    const { getByTestId } = render(<ChatEmptyGreeting routeLabel="Hermes Relay" />);

    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toContain(
      'Hermes Relay is for cloud approvals only',
    );
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toContain('Tailscale');
  });

  it('does not claim connected for generic routes when disconnected', () => {
    const { getByTestId } = render(<ChatEmptyGreeting routeLabel="Computer via USB" />);
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything. Find computers or pick one above to connect — USB is optional.',
    );
  });

  it('shows connected copy when gateway is live', () => {
    const { getByTestId } = render(
      <ChatEmptyGreeting routeLabel="Igors-MacBook-Pro" isConnected />,
    );

    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything — connected via Igors-MacBook-Pro.',
    );
  });

  it('shows unreachable copy when disconnected with a machine label', () => {
    expect(greetingSubtitle('Igors-MacBook-Pro', false)).toBe(
      "Can't reach Igors-MacBook-Pro yet — tap header to retry.",
    );
  });

  it('shows heal copy instead of unreachable during silent reconnect', () => {
    expect(greetingSubtitle('Igors-Mac-mini', false, true)).toBe(
      'Trying to reach Igors-Mac-mini automatically…',
    );
  });

  it('never shows Trying to reach when Connected even if heal pending', () => {
    expect(greetingSubtitle('Igors-Mac-mini', true, true)).toBe(
      'Ask anything — connected via Igors-Mac-mini.',
    );
    const { getByTestId } = render(
      <ChatEmptyGreeting
        routeLabel="Igors-Mac-mini"
        isConnected
        connectionPending
      />,
    );
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything — connected via Igors-Mac-mini.',
    );
  });

  it('does not expose a character avatar in the empty state', () => {
    const { queryByTestId } = render(<ChatEmptyGreeting />);
    expect(queryByTestId('chat-empty-avatar')).toBeNull();
  });
});
