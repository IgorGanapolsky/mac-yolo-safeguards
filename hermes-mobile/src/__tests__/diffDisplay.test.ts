import { hasDiffContent, formatDiffPreview, diffStats } from '../utils/diffDisplay';

describe('diffDisplay', () => {
  it('detects meaningful diff content', () => {
    expect(hasDiffContent('')).toBe(false);
    expect(hasDiffContent('--- a/file\n+++ b/file\n+hello')).toBe(true);
  });

  it('truncates long diffs for mobile preview', () => {
    const diff = Array.from({ length: 20 }, (_, i) => `+line ${i}`).join('\n');
    const preview = formatDiffPreview(diff, 5);
    expect(preview).toContain('more lines on Mac');
  });

  it('counts additions and deletions', () => {
    const stats = diffStats('--- a\n+++ b\n-old\n+new');
    expect(stats).toEqual({ additions: 1, deletions: 1 });
  });
});
