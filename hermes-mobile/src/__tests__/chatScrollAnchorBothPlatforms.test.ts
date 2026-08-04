import fs from 'fs';
import path from 'path';

/**
 * 2026-08-04 user report: "This screen keeps jumping and scrolling up/down by
 * itself."
 *
 * maintainVisibleContentPosition was gated to iOS. That gate was written for
 * @shopify/flash-list, whose RecyclerView remeasure loops crashed the screen
 * (#676/#697/#719). The list is a plain FlatList now and flash-list is not
 * imported anywhere in src/, so the gate only removed scroll anchoring on
 * Android — where every off-screen row remeasure then shifts the viewport.
 */

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('chat list anchors scroll position on every platform', () => {
  const chatScreen = read('src/screens/ChatScreen.tsx');

  it('does not gate maintainVisibleContentPosition behind a platform check', () => {
    const idx = chatScreen.indexOf('maintainVisibleContentPosition');
    expect(idx).toBeGreaterThan(-1);
    const prop = chatScreen.slice(idx, idx + 220);
    expect(prop).toContain('minIndexForVisible');
    // The bug was literally `Platform.OS === 'ios' ? {...} : undefined`.
    expect(prop).not.toMatch(/Platform\.OS\s*===\s*'ios'/);
    expect(prop).not.toContain('undefined');
  });

  it('is justified: the screen no longer imports flash-list', () => {
    // If flash-list ever returns to this screen the remeasure-loop hazard is
    // back and this decision must be revisited rather than silently inherited.
    // Match an IMPORT, not any mention — the rationale comment names the
    // package on purpose, and asserting on prose makes this test meaningless.
    expect(chatScreen).not.toMatch(/^\s*import[^;]*@shopify\/flash-list/m);
    expect(chatScreen).not.toMatch(/require\(['"]@shopify\/flash-list/);
  });
});
