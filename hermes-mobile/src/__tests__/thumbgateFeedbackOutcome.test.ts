import {
  outcomeAccepted,
  outcomeBlocked,
  outcomeFailed,
  outcomeFromCaptureResult,
  outcomeQueuedOffline,
} from '../utils/thumbgateFeedbackOutcome';

describe('thumbgateFeedbackOutcome', () => {
  it('only marks accepted when the server accepted', () => {
    const ok = outcomeAccepted('fb_1');
    expect(ok.accepted).toBe(true);
    expect(ok.note).toMatch(/Saved to ThumbGate/i);
    expect(ok.noteIsError).toBe(false);
  });

  it('never claims Saved when only queued offline', () => {
    const queued = outcomeQueuedOffline();
    expect(queued.accepted).toBe(false);
    expect(queued.queuedOffline).toBe(true);
    expect(queued.note.toLowerCase()).toContain('queued offline');
    expect(queued.note.toLowerCase()).not.toContain('saved to thumbgate memory');
  });

  it('explains missing API key and capture disabled', () => {
    expect(outcomeBlocked('missing_api_key').note).toMatch(/API key/i);
    expect(outcomeBlocked('capture_disabled').note).toMatch(/toggle/i);
  });

  it('maps capture client results honestly', () => {
    expect(outcomeFromCaptureResult({ accepted: true, feedbackId: 'x' }).status).toBe('accepted');
    expect(outcomeFromCaptureResult({ accepted: false, queuedOffline: true }).status).toBe(
      'queued_offline',
    );
    expect(outcomeFromCaptureResult({ accepted: false, status: 401 }).code).toBe('unauthorized');
    expect(outcomeFailed('network', 'timeout').note).toMatch(/timeout/i);
  });
});
