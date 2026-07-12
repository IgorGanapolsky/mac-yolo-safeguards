import React from 'react';
import { View } from 'react-native';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import type { OutboundDeliveryStatus } from '../utils/outboundDeliveryStatus';

type SubmittedPromptStripProps = {
  text: string;
  sentAt?: string;
  status?: OutboundDeliveryStatus;
  connectionState?: LeashConnectionState;
  macHttpOk?: boolean;
};

/**
 * The chat timeline commits an optimistic user bubble before network delivery.
 * A second composer-level copy made every in-flight prompt appear twice.
 */
export default function SubmittedPromptStrip(_props: SubmittedPromptStripProps) {
  if (!_props.text.trim()) {
    return null;
  }
  return (
    <View
      testID="submitted-prompt-strip"
      accessible={false}
      collapsable={false}
      pointerEvents="none"
      style={{ width: 0, height: 0 }}
    />
  );
}
