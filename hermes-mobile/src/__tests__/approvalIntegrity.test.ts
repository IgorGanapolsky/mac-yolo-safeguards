import {
  clearReviewedApprovalDigests,
  consumeReviewedApprovalDigest,
  markApprovalReviewed,
  mobileAllowBlockedReason,
} from '../utils/approvalIntegrity';
import type { ApprovalIntegrity } from '../types/mobileRelay';
import { choicesForRequest } from '../types/approval';

const integrity = (overrides: Partial<ApprovalIntegrity> = {}): ApprovalIntegrity => ({
  version: 1,
  algorithm: 'sha256',
  digest: 'a'.repeat(64),
  issued_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  truncated: false,
  redacted: false,
  review_required_on_computer: false,
  display: { action_id: 'act-1', tool_name: 'Bash', command: 'npm test' },
  ...overrides,
});

describe('mobile approval integrity', () => {
  beforeEach(clearReviewedApprovalDigests);

  it('issues a one-time digest only after the exact call card is reviewed', () => {
    expect(consumeReviewedApprovalDigest('act-1')).toBeUndefined();
    markApprovalReviewed('act-1', integrity());
    expect(consumeReviewedApprovalDigest('act-1')).toBe('a'.repeat(64));
    expect(consumeReviewedApprovalDigest('act-1')).toBeUndefined();
  });

  it('blocks expired, redacted, truncated, and missing integrity', () => {
    expect(mobileAllowBlockedReason()).toMatch(/unavailable/i);
    expect(mobileAllowBlockedReason(integrity({ redacted: true }))).toMatch(/hidden/i);
    expect(mobileAllowBlockedReason(integrity({ truncated: true }))).toMatch(/truncated/i);
    expect(
      mobileAllowBlockedReason(integrity({ expires_at: new Date(Date.now() - 1).toISOString() })),
    ).toMatch(/expired/i);
  });

  it('makes unsafe relay cards deny-only', () => {
    expect(choicesForRequest({
      id: 'act-1',
      source: 'relay_hook',
      title: 'Approval',
      allowPermanent: false,
      approvalIntegrity: integrity({ review_required_on_computer: true }),
    })).toEqual(['deny']);
  });
});
