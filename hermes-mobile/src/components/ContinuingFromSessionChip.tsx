import React from 'react';

type Props = {
  /** Ignored — resume is seamless; no banner/Dismiss UI. */
  visible?: boolean;
  /** Ignored — kept for call-site compatibility during cleanup. */
  onDismiss?: () => void;
  label?: string;
};

/**
 * Session continuity is automatic under the hood (system-prompt handoff inject).
 * This component intentionally renders nothing — users must not see or dismiss a
 * "Continuing from last session" banner.
 */
export default function ContinuingFromSessionChip(_props: Props) {
  return null;
}
