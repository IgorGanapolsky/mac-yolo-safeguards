import {
  elapsedSecondsSince,
  formatElapsedDuration,
} from '../utils/formatElapsedDuration';

describe('formatElapsedDuration', () => {
  it('formats sub-minute waits as seconds', () => {
    expect(formatElapsedDuration(0)).toBe('0s');
    expect(formatElapsedDuration(12)).toBe('12s');
    expect(formatElapsedDuration(59)).toBe('59s');
  });

  it('formats minute waits with zero-padded seconds', () => {
    expect(formatElapsedDuration(60)).toBe('1m');
    expect(formatElapsedDuration(64)).toBe('1m 04s');
    expect(formatElapsedDuration(125)).toBe('2m 05s');
  });

  it('formats hour-scale waits compactly', () => {
    expect(formatElapsedDuration(3661)).toBe('1h 1m 01s');
    expect(formatElapsedDuration(7200)).toBe('2h');
  });

  it('computes elapsed seconds from a start timestamp', () => {
    const sinceMs = Date.parse('2026-07-14T22:00:00.000Z');
    const nowMs = sinceMs + 64_000;
    expect(elapsedSecondsSince(sinceMs, nowMs)).toBe(64);
  });
});
