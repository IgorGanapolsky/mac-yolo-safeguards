import {
  LEASH_COMMON_TOOLS,
  annotatePendingReasonForDisabledTool,
  createLeashCustomTool,
  isLeashToolEnabled,
  leashToolStatusLine,
  mergeLeashToolRows,
  normalizeLeashToolId,
  setLeashToolEnabled,
  toolAttemptRequiresLeashApproval,
} from '../utils/leashCommonTools';

describe('leashCommonTools', () => {
  it('normalizes free-text labels into stable ids', () => {
    expect(normalizeLeashToolId('Stripe CLI!!')).toBe('stripe_cli');
    expect(normalizeLeashToolId('  docker  ')).toBe('docker');
    expect(normalizeLeashToolId('###')).toBe('');
  });

  it('treats every row as allowed when nothing is marked required', () => {
    expect(isLeashToolEnabled('terminal', [])).toBe(true);
    expect(isLeashToolEnabled('terminal', undefined)).toBe(true);
  });

  it('toggles a tool id in and out of the required list', () => {
    const disabled = setLeashToolEnabled('terminal', false, []);
    expect(disabled).toEqual(['terminal']);
    const reenabled = setLeashToolEnabled('terminal', true, disabled);
    expect(reenabled).toEqual([]);
  });

  it('rejects a custom tool that collides with a builtin id', () => {
    const result = createLeashCustomTool('Git');
    expect(result.tool).toBeNull();
    expect(result.duplicate).toBe(true);
  });

  it('rejects a duplicate custom tool (case-insensitive)', () => {
    const first = createLeashCustomTool('Stripe CLI');
    expect(first.tool).not.toBeNull();
    const second = createLeashCustomTool('stripe cli!!', [first.tool!]);
    expect(second.tool).toBeNull();
    expect(second.duplicate).toBe(true);
  });

  it('rejects empty / symbol-only input without crashing', () => {
    expect(createLeashCustomTool('   ').tool).toBeNull();
    expect(createLeashCustomTool('###').tool).toBeNull();
  });

  it('merges builtin rows with custom rows', () => {
    const rows = mergeLeashToolRows([{ id: 'custom_stripe_cli', label: 'Stripe CLI' }]);
    expect(rows).toHaveLength(LEASH_COMMON_TOOLS.length + 1);
    expect(rows[rows.length - 1].id).toBe('custom_stripe_cli');
  });

  describe('toolAttemptRequiresLeashApproval — the actual enforcement boundary', () => {
    it('never requires approval when the required list is empty (default: all allowed)', () => {
      expect(toolAttemptRequiresLeashApproval('terminal', { approvalRequiredIds: [] })).toEqual({
        required: false,
      });
    });

    it('matches a disabled builtin row via its gateway toolset name', () => {
      const match = toolAttemptRequiresLeashApproval('terminal', {
        approvalRequiredIds: ['terminal'],
        command: 'ls -la',
      });
      expect(match).toEqual({ required: true, toolId: 'terminal', label: 'Shell / terminal' });
    });

    it('prefers a command-text hint (git) over the broader terminal match', () => {
      const match = toolAttemptRequiresLeashApproval('terminal', {
        approvalRequiredIds: ['terminal', 'git'],
        command: 'git push origin main',
      });
      expect(match.toolId).toBe('git');
    });

    it('a disabled custom tool only matches when its literal text appears in the command', () => {
      const stripeTool = { id: 'custom_stripe', label: 'stripe' };
      const matched = toolAttemptRequiresLeashApproval('terminal', {
        approvalRequiredIds: ['custom_stripe'],
        customTools: [stripeTool],
        command: 'stripe balance retrieve',
      });
      expect(matched).toEqual({ required: true, toolId: 'custom_stripe', label: 'stripe' });

      const unmatched = toolAttemptRequiresLeashApproval('terminal', {
        approvalRequiredIds: ['custom_stripe'],
        customTools: [stripeTool],
        command: 'git status',
      });
      expect(unmatched).toEqual({ required: false });
    });

    it('a custom tool that never appears in any command never matches anything — proves the honesty bug', () => {
      const stripeTool = { id: 'custom_stripe', label: 'stripe' };
      // Even fully "disabled" (required), a custom tool with no real match target
      // can never annotate a real approval — confirming it has zero enforcement effect
      // beyond cosmetic relabeling of cards whose command happens to contain the text.
      const result = toolAttemptRequiresLeashApproval('web_search', {
        approvalRequiredIds: ['custom_stripe'],
        customTools: [stripeTool],
        command: 'search for stripe pricing docs',
      });
      // "stripe" does appear in the command text here — demonstrating the substring
      // match is the ONLY mechanism; unrelated commands never match at all.
      expect(result.required).toBe(true);

      const noMatch = toolAttemptRequiresLeashApproval('web_search', {
        approvalRequiredIds: ['custom_stripe'],
        customTools: [stripeTool],
        command: 'search for docker pricing docs',
      });
      expect(noMatch.required).toBe(false);
    });
  });

  it('annotates the reason only when a match was required', () => {
    expect(annotatePendingReasonForDisabledTool('run rm -rf', { required: false })).toBe(
      'run rm -rf',
    );
    expect(
      annotatePendingReasonForDisabledTool('run rm -rf', { required: true, label: 'Shell / terminal' }),
    ).toBe('Disabled on Leash · Shell / terminal — run rm -rf');
  });

  it('does not double-annotate an already-tagged reason', () => {
    const once = annotatePendingReasonForDisabledTool('run rm -rf', {
      required: true,
      label: 'Shell / terminal',
    });
    const twice = annotatePendingReasonForDisabledTool(once, {
      required: true,
      label: 'Shell / terminal',
    });
    expect(twice).toBe(once);
  });

  it('describes the enabled/disabled status honestly', () => {
    expect(leashToolStatusLine(true)).toBe('Allowed without prompt');
    expect(leashToolStatusLine(false)).toBe('Requires approve/deny on Leash');
  });
});
