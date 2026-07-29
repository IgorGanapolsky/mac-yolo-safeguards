import {
  NO_REPLY_GUIDANCE_PREFIX,
  buildNoReplyGuidance,
  mentionsLeash,
} from '../utils/noReplyGuidance';
import {
  EMPTY_REPLY_FAILURE_REASON,
  EMPTY_STREAM_HARD_STOP_STATUS,
  emptyStreamCheckingStatus,
} from '../utils/emptyStreamReplyRecovery';
import {
  EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
  emptyStreamTimeoutPlaceholder,
  isDeferredStreamPlaceholder,
} from '../utils/streamAssistantText';
import {
  emptyStreamBannerHint,
  messageIsEmptyStreamTimeout,
} from '../utils/emptyStreamRefreshCta';
import { isEmptyReplyFailureMessage } from '../utils/failedSendRetry';
import { resolveOutboundFailureLabel } from '../utils/outboundDeliveryStatus';

/**
 * DEFECT 2 (2026-07-25, real device). Observed with ZERO approvals waiting and a dead link:
 * "Still no reply text. Hermes checks your Mac briefly, then stops — open Leash for
 *  approve/deny/warn, Stop if a run is active, or start a fresh chat."
 * Generic fallback copy sent the user to an empty Leash screen and hid the real fault.
 */
describe('noReplyGuidance', () => {
  it('omits Leash entirely when there are no pending approvals', () => {
    const copy = buildNoReplyGuidance({
      pendingApprovalsCount: 0,
      runActive: false,
      macHttpOk: true,
      machineLabel: 'Igors-Mac-mini',
    });
    expect(mentionsLeash(copy)).toBe(false);
    expect(copy.toLowerCase()).not.toContain('leash');
    expect(copy.toLowerCase()).not.toContain('approve/deny/warn');
    expect(copy).toContain('start a fresh chat');
  });

  it('omits Stop when no run is active, and names it when one is', () => {
    const idle = buildNoReplyGuidance({ pendingApprovalsCount: 0, runActive: false, macHttpOk: true });
    expect(idle).not.toContain('Stop');

    const running = buildNoReplyGuidance({
      pendingApprovalsCount: 0,
      runActive: true,
      macHttpOk: true,
    });
    expect(running).toContain('Stop the active run');
  });

  it('names Leash only when approvals are actually waiting, with the count', () => {
    const one = buildNoReplyGuidance({ pendingApprovalsCount: 1, macHttpOk: true });
    expect(mentionsLeash(one)).toBe(true);
    expect(one).toContain('approve/deny/warn');
    expect(one).toContain('1 request');

    const many = buildNoReplyGuidance({ pendingApprovalsCount: 3, macHttpOk: true });
    expect(many).toContain('3 requests');
  });

  it('names the dead connection as the fault instead of pointing at Leash', () => {
    const copy = buildNoReplyGuidance({
      pendingApprovalsCount: 0,
      runActive: false,
      macHttpOk: false,
      machineLabel: 'Igors-Mac-mini',
    });
    expect(mentionsLeash(copy)).toBe(false);
    expect(copy).toContain('Igors-Mac-mini');
    expect(copy.toLowerCase()).toMatch(/link .*is down|reconnect/);
    expect(copy.toLowerCase()).toContain('reconnect');
  });

  it('names an unauthenticated link as the fault instead of pointing at Leash', () => {
    const copy = buildNoReplyGuidance({
      pendingApprovalsCount: 0,
      authMismatch: true,
      machineLabel: 'Igors-Mac-mini',
    });
    expect(mentionsLeash(copy)).toBe(false);
    expect(copy.toLowerCase()).toContain('key');
    expect(copy.toLowerCase()).toContain('re-pair');
  });

  it('never points at Leash on a dead link even while approvals are queued', () => {
    const copy = buildNoReplyGuidance({
      pendingApprovalsCount: 2,
      macHttpOk: false,
      machineLabel: 'Igors-Mac-mini',
    });
    expect(mentionsLeash(copy)).toBe(false);
    expect(copy.toLowerCase()).toContain('reconnect');
  });

  it('shipped default copy no longer sends users to an empty Leash screen', () => {
    for (const copy of [
      EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
      EMPTY_REPLY_FAILURE_REASON,
      EMPTY_STREAM_HARD_STOP_STATUS,
      emptyStreamCheckingStatus(120_000),
      emptyStreamBannerHint(45_000),
      emptyStreamTimeoutPlaceholder({ pendingApprovalsCount: 0, macHttpOk: true }),
    ]) {
      expect(mentionsLeash(copy)).toBe(false);
      expect(copy.toLowerCase()).not.toContain('approve/deny/warn');
    }
  });

  it('keeps every variant classifiable by downstream code we do not own', () => {
    const variants = [
      buildNoReplyGuidance(),
      buildNoReplyGuidance({ pendingApprovalsCount: 2, runActive: true, macHttpOk: true }),
      buildNoReplyGuidance({ macHttpOk: false, machineLabel: 'Igors-Mac-mini' }),
      buildNoReplyGuidance({ authMismatch: true }),
      buildNoReplyGuidance({ hardStopped: true }),
    ];
    for (const variant of variants) {
      expect(variant.startsWith(NO_REPLY_GUIDANCE_PREFIX)).toBe(true);
      // src/utils/streamAssistantText.ts + src/utils/emptyStreamRefreshCta.ts
      expect(isDeferredStreamPlaceholder(variant)).toBe(true);
      expect(messageIsEmptyStreamTimeout(variant)).toBe(true);
      // src/utils/failedSendRetry.ts (agent B — untouched here)
      expect(isEmptyReplyFailureMessage(variant)).toBe(true);
      // src/utils/outboundDeliveryStatus.ts (agent E — untouched here)
      expect(resolveOutboundFailureLabel(variant, true)).toContain("didn't answer");
    }
  });
});
