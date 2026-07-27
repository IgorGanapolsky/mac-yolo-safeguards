import { formatSessionCreated } from '../utils/sessionDisplay';

// CEO, 2026-07-26, from live screenshots:
//  - "Needs computer link" -> "What the hell is computer link"
//  - the header timestamp -> "be sure you say that's when thread was started"
// Both were internal shorthand rendered straight into the UI.
describe('plain-language status copy', () => {
  it('labels the thread timestamp as the START time, not a bare clock', () => {
    const label = formatSessionCreated('2026-07-26T18:53:00.000Z');
    expect(label).toMatch(/^Started /);
    expect(label).toMatch(/2026/);
  });

  it('returns null for an unparseable timestamp rather than "Started undefined"', () => {
    expect(formatSessionCreated('not-a-date')).toBeNull();
    expect(formatSessionCreated(null)).toBeNull();
  });

  it('never ships the phrase "computer link" as a user-facing status', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'utils', 'gatewayConnection.ts'),
      'utf8',
    );
    // allowed in comments; must not be a returned label
    expect(src).not.toMatch(/label:\s*'Needs computer link'/);
    expect(src).toMatch(/Can't reach your Mac/);
  });
});
