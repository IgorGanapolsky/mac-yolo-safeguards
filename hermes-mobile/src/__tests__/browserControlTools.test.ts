import {
  browserControlRiskFloor,
  browserControlToolLabel,
  isBrowserControlTool,
  leashBadgeForTool,
} from '../utils/browserControlTools';

describe('browserControlTools', () => {
  it('detects hermes-agent browser tool names', () => {
    expect(isBrowserControlTool('browser_navigate')).toBe(true);
    expect(isBrowserControlTool('browser_click')).toBe(true);
    expect(isBrowserControlTool('browser_cdp')).toBe(true);
    expect(isBrowserControlTool('computer_use')).toBe(true);
    expect(isBrowserControlTool('Browser_Fill')).toBe(true);
    expect(isBrowserControlTool('run_command')).toBe(false);
    expect(isBrowserControlTool('')).toBe(false);
  });

  it('labels tools for Leash cards', () => {
    expect(browserControlToolLabel('browser_navigate')).toBe('Browser · navigate');
    expect(browserControlToolLabel('browser_click')).toBe('Browser · click');
    expect(browserControlToolLabel('run_command')).toBe('run_command');
  });

  it('floors browser actions to medium risk', () => {
    expect(browserControlRiskFloor('browser_click')).toBe('medium');
    expect(browserControlRiskFloor('browser_navigate')).toBe('medium');
    expect(browserControlRiskFloor('shell')).toBeNull();
  });

  it('returns Leash badge for browser tools only', () => {
    expect(leashBadgeForTool('browser_fill')).toBe('BROWSER CONTROL');
    expect(leashBadgeForTool('git_push')).toBeNull();
  });
});
