/**
 * Leash / approval helpers for Hermes browser-control tools (WebBridge wedge).
 * Keeps browser actions recognizable on the phone when the Mac agent drives Chrome.
 */

const BROWSER_TOOL_PREFIXES = [
  'browser_',
  'browser.',
  'computer_use',
  'computer-use',
] as const;

/** Exact tool names from hermes-agent browser toolset (non-prefix matches). */
const BROWSER_TOOL_EXACT = new Set([
  'browser',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_fill',
  'browser_snapshot',
  'browser_screenshot',
  'browser_console',
  'browser_cdp',
  'browser_tab',
  'browser_press',
  'browser_scroll',
  'browser_select',
  'browser_hover',
  'browser_wait',
  'computer_use',
  'computer_use_click',
  'computer_use_type',
]);

export function isBrowserControlTool(toolName?: string | null): boolean {
  const name = (toolName ?? '').trim().toLowerCase();
  if (!name) {
    return false;
  }
  if (BROWSER_TOOL_EXACT.has(name)) {
    return true;
  }
  return BROWSER_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Human label for Leash / approval cards. */
export function browserControlToolLabel(toolName?: string | null): string {
  const raw = (toolName ?? '').trim();
  if (!raw) {
    return 'Browser control';
  }
  if (!isBrowserControlTool(raw)) {
    return raw;
  }
  const short = raw
    .replace(/^browser[_.]/i, '')
    .replace(/^computer[_.-]?use[_.]?/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (!short) {
    return 'Browser control';
  }
  return `Browser · ${short}`;
}

/**
 * Browser actions that mutate pages or submit forms are at least medium risk
 * for Leash defaults (never treat fill/click as "low" silently).
 */
export function browserControlRiskFloor(
  toolName?: string | null,
): 'medium' | 'high' | null {
  if (!isBrowserControlTool(toolName)) {
    return null;
  }
  const name = (toolName ?? '').toLowerCase();
  if (
    /click|fill|type|press|select|submit|cdp|evaluate|console|computer_use/.test(
      name,
    )
  ) {
    return 'medium';
  }
  if (/navigate|snapshot|screenshot|wait|scroll|hover|tab/.test(name)) {
    return 'medium';
  }
  return 'medium';
}

export function leashBadgeForTool(toolName?: string | null): string | null {
  if (!isBrowserControlTool(toolName)) {
    return null;
  }
  return 'BROWSER CONTROL';
}
