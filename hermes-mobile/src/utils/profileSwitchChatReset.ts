/**
 * Machine / gateway-profile switch must never paint the new Mac identity with
 * the previous Mac's composer, optimistic bubbles, or in-flight stream mutations.
 *
 * Ordering law (ChatScreen.handleSelectGatewayProfile):
 * 1. Bump outbound epoch + clear UI synchronously
 * 2. Then await selectGatewayProfile / refreshHealth
 *
 * Clearing after await (or only when closePicker) races the header/profile paint.
 */

export type ProfileSwitchChatResetPlan = {
  /** Always true when from ≠ to — UI must clear before any await. */
  clearUiBeforeAwait: boolean;
  /** Invalidate in-flight stream / optimistic mutations from the prior profile. */
  bumpOutboundEpoch: boolean;
  /** Force session-change effect to drop transcript (do not preserve outbound). */
  intentionalProfileSwitch: boolean;
};

export function shouldResetChatOnProfileSwitch(
  fromProfileId: string | null | undefined,
  toProfileId: string | null | undefined,
): boolean {
  const from = fromProfileId?.trim() || null;
  const to = toProfileId?.trim() || null;
  if (!to) {
    return false;
  }
  return from !== to;
}

export function planProfileSwitchChatReset(input: {
  fromProfileId: string | null | undefined;
  toProfileId: string | null | undefined;
}): ProfileSwitchChatResetPlan | null {
  if (!shouldResetChatOnProfileSwitch(input.fromProfileId, input.toProfileId)) {
    return null;
  }
  return {
    clearUiBeforeAwait: true,
    bumpOutboundEpoch: true,
    intentionalProfileSwitch: true,
  };
}

/**
 * Stream / optimistic commit callbacks capture an epoch at send start.
 * After a machine switch bumps the active epoch, stale mutations must no-op
 * so machine A's bubble cannot appear on machine B's transcript.
 */
export function shouldAcceptOutboundMutation(input: {
  mutationEpoch: number;
  activeEpoch: number;
}): boolean {
  return input.mutationEpoch === input.activeEpoch;
}

export function nextOutboundEpoch(current: number): number {
  return (Number.isFinite(current) ? current : 0) + 1;
}
