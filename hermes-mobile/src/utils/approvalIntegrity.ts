import type { ApprovalIntegrity } from '../types/mobileRelay';

const reviewedDigests = new Map<string, string>();

export function mobileAllowBlockedReason(integrity?: ApprovalIntegrity): string | null {
  if (!integrity?.digest) return 'Exact call verification is unavailable';
  if (integrity.redacted || integrity.truncated || integrity.review_required_on_computer) {
    return 'This call contains hidden or truncated data. Review it on your computer.';
  }
  if (!Number.isFinite(Date.parse(integrity.expires_at)) || Date.parse(integrity.expires_at) <= Date.now()) {
    return 'This approval expired. Wait for a fresh request.';
  }
  return null;
}

export function markApprovalReviewed(actionId: string, integrity?: ApprovalIntegrity): void {
  if (!mobileAllowBlockedReason(integrity) && integrity) {
    reviewedDigests.set(actionId, integrity.digest);
  }
}

export function consumeReviewedApprovalDigest(actionId: string): string | undefined {
  const digest = reviewedDigests.get(actionId);
  reviewedDigests.delete(actionId);
  return digest;
}

export function clearReviewedApprovalDigests(): void {
  reviewedDigests.clear();
}
