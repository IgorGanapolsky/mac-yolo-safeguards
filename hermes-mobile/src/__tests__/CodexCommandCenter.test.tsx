import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CodexCommandCenter from '../components/CodexCommandCenter';

describe('CodexCommandCenter', () => {
  it('summarizes run, approvals, and tools when Mac is healthy', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={2}
        sessions={[
          {
            id: 'session-1',
            title: 'Revenue repair',
            last_active: 20,
            tool_call_count: 3,
          },
          {
            id: 'session-2',
            title: 'Gateway audit',
            last_active: 10,
            tool_call_count: 4,
          },
        ]}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Running tests',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
    expect(getByText('2')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText('Tool calls')).toBeTruthy();
    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
  });

  it('routes approvals and tools handlers', () => {
    const onOpenApprovals = jest.fn();
    const onOpenTools = jest.fn();
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        pendingApprovalCount={1}
        sessions={[]}
        onOpenApprovals={onOpenApprovals}
        onOpenTools={onOpenTools}
      />,
    );

    fireEvent.press(getByTestId('command-center-approvals'));
    expect(onOpenApprovals).toHaveBeenCalled();

    fireEvent.press(getByTestId('command-center-tools'));
    expect(onOpenTools).toHaveBeenCalled();
  });

  it('hides Mac tile when HTTP is reachable without live socket', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connecting"
        macHttpReachable
        pendingApprovalCount={0}
        sessions={[]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(queryByTestId('command-center-approvals')).toBeNull();
  });

  it('shows Mac tile when offline', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="disconnected"
        pendingApprovalCount={0}
        sessions={[]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-link-state').props.children).toBe('Not connected');
  });

  it('hides Run tile when idle', () => {
    const { queryByTestId, getByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        macHttpReachable
        pendingApprovalCount={0}
        sessions={[]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
    expect(queryByTestId('command-center-link-state')).toBeNull();
    expect(getByTestId('command-center-tools')).toBeTruthy();
  });

  it('hides Run tile when run completed', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        runProgress={{
          phase: 'completed',
          startedAtMs: Date.now() - 5000,
          detail: 'Done',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
  });

  it('hides Run tile when run phase is idle', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        runProgress={{
          phase: 'idle',
          startedAtMs: Date.now() - 1000,
          detail: 'Ready',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
  });

  it('shows Run tile for active streaming phase', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Running tests',
          sessionId: 'session-1',
        }}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
  });

  it('hides Run tile while sending without a run id', () => {
    const { queryByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        isSending
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-run-state')).toBeNull();
  });

  it('shows Run tile while sending once a run id exists', () => {
    const { getByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        isSending
        runProgress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 1000,
          detail: 'Running tests',
          sessionId: 'session-1',
          runId: 'run-123',
        }}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-run-state').props.children).toBe('Running');
  });

  it('hides Leash tile when there are no pending approvals', () => {
    const { queryByTestId, getByTestId } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(queryByTestId('command-center-approvals')).toBeNull();
    expect(getByTestId('command-center-tools')).toBeTruthy();
  });

  it('shows Leash tile when there are pending approvals', () => {
    const { getByTestId, getByText } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={3}
        sessions={[]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(getByTestId('command-center-approvals')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('shows Open when there are no tool calls recorded', () => {
    const { getByText } = render(
      <CodexCommandCenter
        connectionState="connected"
        pendingApprovalCount={0}
        sessions={[{ id: 'session-1', title: 'Empty', last_active: 1 }]}
        onOpenApprovals={jest.fn()}
        onOpenTools={jest.fn()}
      />,
    );

    expect(getByText('Open')).toBeTruthy();
    expect(getByText('Open tools')).toBeTruthy();
  });
});
