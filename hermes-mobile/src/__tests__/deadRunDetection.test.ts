import {
  DEAD_RUN_ENDED_DETAIL,
  DEAD_RUN_TRANSCRIPT_STALE_MS,
  isComposerSendDisabled,
  isDeadRunEndedMessage,
  shouldSurfaceDeadRunEnded,
  transcriptUnchangedMs,
} from '../utils/deadRunDetection';

describe('deadRunDetection', () => {
  it('matches the dead-run ended detail copy', () => {
    expect(isDeadRunEndedMessage(DEAD_RUN_ENDED_DETAIL)).toBe(true);
    expect(isDeadRunEndedMessage('Still no reply text')).toBe(false);
  });

  it('computes transcript unchanged duration', () => {
    expect(transcriptUnchangedMs(1_000, 90_000)).toBe(89_000);
    expect(transcriptUnchangedMs(null, 90_000)).toBe(0);
  });

  it('surfaces after stale transcript with no gateway activity', () => {
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: true,
        transcriptUnchangedMs: DEAD_RUN_TRANSCRIPT_STALE_MS,
        gatewayHasLiveRun: false,
      }),
    ).toBe(true);
  });

  it('surfaces even while unrelated Obsidian agents are active elsewhere on the gateway', () => {
    // Regression: activeAgentCount used to come from the global
    // /v1/obsidian/agents list (every agent on the Mac, not this run), so any
    // unrelated scheduled job/automation running elsewhere permanently blocked
    // dead-run detection for this session — Send stayed grayed forever.
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: true,
        transcriptUnchangedMs: DEAD_RUN_TRANSCRIPT_STALE_MS + 1,
        gatewayHasLiveRun: false,
      }),
    ).toBe(true);
  });

  it('does not surface while gateway still reports a live run', () => {
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: true,
        transcriptUnchangedMs: DEAD_RUN_TRANSCRIPT_STALE_MS + 1,
        gatewayHasLiveRun: true,
      }),
    ).toBe(false);
  });

  it('does not surface before the stale transcript threshold', () => {
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: true,
        transcriptUnchangedMs: DEAD_RUN_TRANSCRIPT_STALE_MS - 1,
        gatewayHasLiveRun: false,
      }),
    ).toBe(false);
  });

  it('does not surface when the client is idle', () => {
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: false,
        transcriptUnchangedMs: DEAD_RUN_TRANSCRIPT_STALE_MS + 60_000,
        gatewayHasLiveRun: false,
      }),
    ).toBe(false);
  });

  it('keeps send disabled while pinned outbound is still pending', () => {
    expect(
      isComposerSendDisabled({
        isSending: false,
        queuedOutboundCount: 0,
        outboundStillPending: true,
      }),
    ).toBe(true);
  });

  it('re-enables send after dead-run unlock clears outbound locks', () => {
    expect(
      isComposerSendDisabled({
        isSending: false,
        queuedOutboundCount: 0,
        outboundStillPending: false,
      }),
    ).toBe(false);
  });
});
