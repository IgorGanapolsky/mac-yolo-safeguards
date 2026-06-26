import {
  buildChatOutputThumbgateCaptureBody,
  buildLeashThumbgateCaptureBody,
} from '../utils/leashThumbgate';

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

  it('builds chat output feedback payload with optional explanation', () => {
    const body = buildChatOutputThumbgateCaptureBody(
      {
        id: 'msg_1',
        role: 'assistant',
        content: 'I can do that. Please confirm you want to proceed.',
      },
      'down',
      {
        session: { id: 'sess_1', title: 'Money loop' },
        explanation: 'This should have become a Leash approval card.',
      },
    );

    expect(body.signal).toBe('down');
    expect(body.context).toContain('Hermes Mobile chat output');
    expect(body.context).toContain('session: sess_1');
    expect(body.whatWentWrong).toBe('This should have become a Leash approval card.');
    expect(body.tags).toEqual(
      expect.arrayContaining(['hermes-mobile', 'leash', 'chat-output', 'thumbs-down']),
    );
  });

  it('builds chat output thumbs-up payload without explanation', () => {
    const body = buildChatOutputThumbgateCaptureBody(
      {
        role: 'assistant',
        content: '',
        rawContent: 'Useful final report',
      },
      'up',
    );

    expect(body.signal).toBe('up');
    expect(body.context).toContain('Useful final report');
    expect(body.whatWorked).toBe('Operator marked this Hermes output as useful.');
    expect(body.tags).toContain('thumbs-up');
  });

  it('clips long chat output feedback context', () => {
    const body = buildChatOutputThumbgateCaptureBody(
      {
        role: 'assistant',
        content: 'x'.repeat(1900),
      },
      'down',
    );

    expect(body.context.length).toBeLessThan(1900);
    expect(body.context).toContain('...');
    expect(body.whatToChange).toContain('Adjust future Hermes outputs');
  });
});
