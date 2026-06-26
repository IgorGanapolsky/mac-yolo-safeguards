import React from 'react';
import { StyleSheet, View } from 'react-native';
import HermesApprovalCard from './HermesApprovalCard';
import type { HermesApprovalRequest } from '../types/approval';
import type { ApprovalChoice } from '../types/approval';

type ChatApprovalBarProps = {
  approvals?: HermesApprovalRequest[];
  approval?: HermesApprovalRequest | null;
  busy?: boolean;
  undoSecondsLeft?: number;
  approvalPolicy?: 'strict' | 'balanced' | 'autonomous';
  onChoice: (choice: ApprovalChoice, approval: HermesApprovalRequest) => void;
  onEdit?: (approval: HermesApprovalRequest) => void;
  onUndo?: () => void;
};

/** Compact chat composer approval bar — supports multiple pending approvals + undo strip. */
export default function ChatApprovalBar({
  approvals,
  approval,
  busy = false,
  undoSecondsLeft = 0,
  approvalPolicy = 'balanced',
  onChoice,
  onEdit,
  onUndo,
}: ChatApprovalBarProps) {
  const queue =
    approvals && approvals.length > 0
      ? approvals
      : approval
        ? [approval]
        : [];

  if (queue.length === 0 && undoSecondsLeft <= 0) {
    return null;
  }

  return (
    <View style={styles.wrap} testID="chat-approval-bar">
      {undoSecondsLeft > 0 && onUndo ? (
        <HermesApprovalCard
          approval={{
            id: 'undo',
            source: 'gateway_guard',
            title: '',
            allowPermanent: false,
          }}
          variant="chat"
          undoSecondsLeft={undoSecondsLeft}
          onChoice={() => {}}
          onUndo={onUndo}
        />
      ) : null}
      {queue.map((item) => (
        <HermesApprovalCard
          key={item.id}
          approval={item}
          variant="chat"
          busy={busy}
          approvalPolicy={approvalPolicy}
          onChoice={(choice) => onChoice(choice, item)}
          onEdit={onEdit ? () => onEdit(item) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
});
