import { buildLeashThumbgateCaptureBody } from '../utils/leashThumbgate';

describe('buildLeashThumbgateCaptureBody', () => {
  const approval = {
    actionId: 'act-1',
    toolName: 'run_command',
    reason: 'dangerous rm',
    command: 'rm -rf /tmp/foo',
    workspacePath: '/Users/igor/proj',
    receivedAt: '2026-06-18T12:00:00Z',
  };

  it('builds thumbs-down capture payload', () => {
    const body = buildLeashThumbgateCaptureBody(approval, 'down');
    expect(body.signal).toBe('down');
    expect(body.context).toContain('run_command');
    expect(body.context).toContain('rm -rf');
    expect(body.whatWentWrong).toBe('dangerous rm');
    expect(body.tags).toContain('hermes-mobile');
  });

  it('builds thumbs-up capture payload', () => {
    const body = buildLeashThumbgateCaptureBody(approval, 'up');
    expect(body.signal).toBe('up');
    expect(body.whatWorked).toContain('run_command');
  });
});
