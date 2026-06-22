import React from 'react';
import HermesApprovalCard from './HermesApprovalCard';
import type { PendingApproval } from '../types/gateway';
import type { ApprovalChoice, ApprovalPolicy } from '../types/approval';
import { fromPendingApproval } from '../utils/approvalNormalize';

interface GateApprovalCardProps {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
  onChoice?: (choice: ApprovalChoice) => void;
  onEdit?: () => void;
  glance?: boolean;
  approvalPolicy?: ApprovalPolicy;
  thumbgateCaptureOnDown?: boolean;
  thumbgateCaptureOnUp?: boolean;
}

export default function GateApprovalCard({
  approval,
  onApprove,
  onReject,
  onChoice,
  onEdit,
  glance = false,
  approvalPolicy = 'balanced',
  thumbgateCaptureOnDown = true,
  thumbgateCaptureOnUp = false,
}: GateApprovalCardProps) {
  const request = fromPendingApproval(approval, approvalPolicy);

  const handleChoice = (choice: ApprovalChoice) => {
    if (onChoice) {
      onChoice(choice);
      return;
    }
    if (choice === 'deny') {
      onReject();
      return;
    }
    onApprove();
  };

  return (
    <HermesApprovalCard
      approval={request}
      variant="leash"
      glance={glance}
      thumbgateCaptureOnDown={thumbgateCaptureOnDown}
      thumbgateCaptureOnUp={thumbgateCaptureOnUp}
      approvalPolicy={approvalPolicy}
      onChoice={handleChoice}
      onEdit={onEdit}
    />
  );
}
