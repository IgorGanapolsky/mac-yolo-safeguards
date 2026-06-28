import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CodexCommandCenter from '../components/CodexCommandCenter';

describe('CodexCommandCenter', () => {
  it('summarizes run and approvals when Mac is healthy', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={2}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Running tests',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
    expect(getByText('2')).toBeTruthy();
  });

  it('routes approvals handler', () => {
    const onOpenApprovals = jest.fn();
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        pendingApprovalCount={1}
        onOpenApprovals={onOpenApprovals}
      />,
    );

    fireEvent.press(getByTestId('command-center-approvals'));
    expect(onOpenApprovals).toHaveBeenCalled();
  });

  it('hides Mac tile when HTTP is reachable without live socket', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connecting"
        macHttpReachable
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(queryByTestId('command-center-approvals')).toBeNull();
    expect(queryByTestId('codex-command-center')).toBeNull();
  });

  it('shows Mac tile when offline with tap to reconnect copy', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-link-state').props.children).toBe('Not connected');
    expect(getByTestId('command-center-mac-detail').props.children).toBe('Tap to reconnect');
  });

  it('shows reconnecting state while mac retry is busy', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        macRetryBusy
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-mac-detail').props.children).toBe('Reconnecting…');
  });

  it('shows custom machine name when mac retry is busy', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        macRetryBusy
        machineName="Igors-Mac-mini"
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-link-state').props.children).toBe('Igors-Mac-mini');
    expect(getByTestId('command-center-mac-detail').props.children).toBe('Reconnecting…');
  });

  it('shows checking status with custom machine name when connecting', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="connecting"
        machineName="Igors-Mac-mini"
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-link-state').props.children).toBe('Connecting');
    expect(getByTestId('command-center-mac-detail').props.children).toBe('Checking Igors-Mac-mini');
  });

  it('calls onMacRetry when Mac tile is pressed', () => {
    const onMacRetry = jest.fn();
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
        onMacRetry={onMacRetry}
      />,
    );

    fireEvent.press(getByTestId('command-center-mac-tile'));
    expect(onMacRetry).toHaveBeenCalled();
  });

  it('hides entire command center when connected and idle', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        macHttpReachable
        pendingApprovalCount={0}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(queryByTestId('codex-command-center')).toBeNull();
  });

  it('hides Run tile when run completed', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        runProgress={{
          phase: 'completed',
          startedAtMs: Date.now() - 5000,
          detail: 'Done',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
    expect(queryByTestId('codex-command-center')).toBeNull();
  });

  it('shows Run tile for active streaming phase', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Running tests',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
  });

  it('shows Leash tile when there are pending approvals', () => {
    const { getByTestId, getByText } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={3}
        onOpenApprovals={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-approvals')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });
});
