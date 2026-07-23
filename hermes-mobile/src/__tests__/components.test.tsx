import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import GlassCard from '../components/GlassCard';
import GateApprovalCard from '../components/GateApprovalCard';
import HealthPill from '../components/HealthPill';

describe('GlassCard', () => {
  it('renders children', () => {
    const { getByText } = render(
      <GlassCard>
        <Text>Test Card</Text>
      </GlassCard>
    );
    expect(getByText('Test Card')).toBeTruthy();
  });

  it('handles onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <GlassCard onPress={onPress}>
        <Text>Tap me</Text>
      </GlassCard>
    );
    fireEvent.press(getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GateApprovalCard', () => {
  const mockApproval = {
    actionId: 'act_123',
    toolName: 'run_command',
    reason: 'dangerous script running',
    command: 'rm -rf /',
    workspacePath: '/path/to/project',
    receivedAt: '2026-06-15T12:00:00Z',
  };

  it('renders approval details', () => {
    const { getByText } = render(
      <GateApprovalCard
        approval={mockApproval}
        onApprove={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(getByText('run_command')).toBeTruthy();
    expect(getByText('dangerous script running')).toBeTruthy();
    expect(getByText('rm -rf /')).toBeTruthy();
    expect(getByText('Workspace: /path/to/project')).toBeTruthy();
  });

  it('triggers onApprove when approve button is pressed', () => {
    const onApprove = jest.fn();
    const { getByText } = render(
      <GateApprovalCard
        approval={mockApproval}
        onApprove={onApprove}
        onReject={jest.fn()}
      />
    );
    fireEvent.press(getByText('Thumbs up'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('triggers onReject when reject button is pressed', () => {
    const onReject = jest.fn();
    const { getByText } = render(
      <GateApprovalCard
        approval={mockApproval}
        onApprove={jest.fn()}
        onReject={onReject}
      />
    );
    fireEvent.press(getByText('Thumbs down'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

describe('HealthPill', () => {
  it('renders technical default labels for Settings/Ops callers', () => {
    const { getByText } = render(<HealthPill level="green" />);
    expect(getByText('Gateway healthy')).toBeTruthy();
  });

  it('renders caller-provided label for Leash calm status', () => {
    const { getByText } = render(<HealthPill level="green" label="Connected" />);
    expect(getByText('Connected')).toBeTruthy();
  });

  it('renders correctly for red level with details', () => {
    const { getByText } = render(
      <HealthPill level="red" label={"Can't reach your Mac"} detail="error 500" />,
    );
    expect(getByText("Can't reach your Mac")).toBeTruthy();
    expect(getByText('error 500')).toBeTruthy();
  });

  it('renders correctly for amber level', () => {
    const { getByText } = render(<HealthPill level="amber" label="Needs attention" />);
    expect(getByText('Needs attention')).toBeTruthy();
  });

  it('renders correctly for unknown level', () => {
    const { getByText } = render(<HealthPill level="unknown" label="Checking…" />);
    expect(getByText('Checking…')).toBeTruthy();
  });
});
