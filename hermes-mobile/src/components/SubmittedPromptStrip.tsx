import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  outboundDeliveryLabel,
  type OutboundDeliveryStatus,
} from '../utils/outboundDeliveryStatus';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';

type SubmittedPromptStripProps = {
  text: string;
  status?: OutboundDeliveryStatus;
  connectionState?: LeashConnectionState;
  macHttpOk?: boolean;
};

export default function SubmittedPromptStrip({
  text,
  status = 'pending',
  connectionState = 'demo',
  macHttpOk = true,
}: SubmittedPromptStripProps) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const statusLabel = outboundDeliveryLabel(status, { connectionState, macHttpOk });
  const displayPending =
    status === 'pending' ||
    (status === 'sent' && statusLabel.startsWith('○'));

  return (
    <View style={styles.wrap} testID="submitted-prompt-strip">
      <Text style={styles.label}>You sent</Text>
      <Text style={styles.body} numberOfLines={8} ellipsizeMode="tail" selectable>
        {trimmed}
      </Text>
      <Text
        style={[
          styles.status,
          status === 'failed' && styles.statusFailed,
          displayPending && styles.statusPending,
        ]}
      >
        {statusLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
    backgroundColor: 'rgba(79, 70, 229, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
  },
  status: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  statusFailed: {
    color: colors.error,
  },
  statusPending: {
    color: colors.warning,
  },
});
