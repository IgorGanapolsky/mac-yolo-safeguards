import { isManualNeedsPairError } from '../utils/manualNeedsPair';

describe('isManualNeedsPairError', () => {
  it('detects the live Connect paste error', () => {
    expect(
      isManualNeedsPairError('Hermes is reachable, but this phone still needs to pair.'),
    ).toBe(true);
  });

  it('detects ThumbGate reachable-but-needs-pairing copy', () => {
    expect(
      isManualNeedsPairError(
        'ThumbGate is reachable but needs pairing. Open ThumbGate on your Mac and tap the pair button.',
      ),
    ).toBe(true);
  });

  it('rejects unrelated failures', () => {
    expect(isManualNeedsPairError('Couldn’t reach ThumbGate at this Tailscale address.')).toBe(
      false,
    );
    expect(isManualNeedsPairError(null)).toBe(false);
  });
});
