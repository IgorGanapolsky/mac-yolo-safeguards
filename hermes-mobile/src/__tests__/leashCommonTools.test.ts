import {
  annotatePendingReasonForDisabledTool,
  createLeashCustomTool,
  isLeashToolEnabled,
  LEASH_COMMON_TOOLS,
  setLeashToolEnabled,
  toolAttemptRequiresLeashApproval,
} from '../utils/leashCommonTools';

describe('leashCommonTools', () => {
  it('defaults every builtin tool to enabled', () => {
    for (const tool of LEASH_COMMON_TOOLS) {
      expect(isLeashToolEnabled(tool.id, [])).toBe(true);
      expect(isLeashToolEnabled(tool.id, undefined)).toBe(true);
    }
  });

  it('marks disabled tools as requiring approval', () => {
    const next = setLeashToolEnabled('terminal', false, []);
    expect(next).toEqual(['terminal']);
    expect(isLeashToolEnabled('terminal', next)).toBe(false);
    expect(isLeashToolEnabled('browser', next)).toBe(true);
    expect(setLeashToolEnabled('terminal', true, next)).toEqual([]);
  });

  it('matches gateway tool names and commands for disabled rows', () => {
    const required = ['terminal', 'git', 'browser'];
    expect(
      toolAttemptRequiresLeashApproval('terminal', {
        approvalRequiredIds: required,
        command: 'ls',
      }).required,
    ).toBe(true);
    expect(
      toolAttemptRequiresLeashApproval('run_command', {
        approvalRequiredIds: required,
        command: 'git push origin main',
      }).toolId,
    ).toBe('git');
    expect(
      toolAttemptRequiresLeashApproval('browser_click', {
        approvalRequiredIds: required,
      }).toolId,
    ).toBe('browser');
    expect(
      toolAttemptRequiresLeashApproval('memory', {
        approvalRequiredIds: required,
      }).required,
    ).toBe(false);
  });

  it('creates custom tools with unique ids', () => {
    const custom = createLeashCustomTool('Stripe CLI');
    expect(custom).toEqual({
      id: 'custom_stripe_cli',
      label: 'Stripe CLI',
    });
    expect(createLeashCustomTool('terminal')).toBeNull();
    expect(createLeashCustomTool('   ')).toBeNull();
  });

  it('annotates pending reasons when policy matched', () => {
    expect(
      annotatePendingReasonForDisabledTool('Dangerous shell', {
        required: true,
        label: 'Shell / terminal',
      }),
    ).toBe('Disabled on Leash · Shell / terminal — Dangerous shell');
  });
});
