import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HermesApprovalCard from '../components/HermesApprovalCard';
import type { HermesApprovalRequest } from '../types/approval';
import { clearReviewedApprovalDigests, consumeReviewedApprovalDigest } from '../utils/approvalIntegrity';

jest.mock('../services/haptics', () => ({
  haptics: { success: jest.fn(), warning: jest.fn() },
}));

const safeRelayApproval = (): HermesApprovalRequest => ({
  id: 'act-1',
  source: 'relay_hook',
  title: 'Run tests',
  command: 'npm test',
  workspacePath: '/repo',
  allowPermanent: false,
  approvalIntegrity: {
    version: 1,
    algorithm: 'sha256',
    digest: 'a'.repeat(64),
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    truncated: false,
    redacted: false,
    review_required_on_computer: false,
    display: {
      action_id: 'act-1',
      tool_name: 'Bash',
      destination: '/repo',
      command: 'npm test',
      affected_files: ['src/app.ts'],
    },
  },
});

describe('HermesApprovalCard approval integrity', () => {
  beforeEach(clearReviewedApprovalDigests);

  it('mints the one-time digest only on an explicit in-app allow tap', () => {
    const onChoice = jest.fn();
    const { getByTestId, getByText } = render(
      <HermesApprovalCard approval={safeRelayApproval()} variant="chat" onChoice={onChoice} />,
    );
    expect(getByText('Files: src/app.ts')).toBeTruthy();
    expect(consumeReviewedApprovalDigest('act-1')).toBeUndefined();
    fireEvent.press(getByTestId('approval-allow-once'));
    expect(consumeReviewedApprovalDigest('act-1')).toBe('a'.repeat(64));
    expect(onChoice).toHaveBeenCalledWith('once');
  });

  it('is deny-only when exact call verification is missing', () => {
    const approval = { ...safeRelayApproval(), approvalIntegrity: undefined };
    const { getByTestId, queryByTestId } = render(
      <HermesApprovalCard approval={approval} variant="chat" onChoice={jest.fn()} />,
    );
    expect(getByTestId('approval-integrity-warning')).toBeTruthy();
    expect(getByTestId('approval-deny')).toBeTruthy();
    expect(queryByTestId('approval-allow-once')).toBeNull();
  });

  it('never exposes allow from glance mode', () => {
    const { getByTestId, queryByTestId } = render(
      <HermesApprovalCard approval={safeRelayApproval()} variant="chat" glance onChoice={jest.fn()} />,
    );
    expect(getByTestId('approval-deny')).toBeTruthy();
    expect(queryByTestId('approval-allow-once')).toBeNull();
  });
});
