import {
  enqueuedEventToPendingApproval,
  DEFAULT_AGENTLEASH_CLOUD_URL,
} from '../services/agentLeashClient';
import type { EnqueuedEvent } from '../types/agentLeash';

describe('agentLeashClient', () => {
  it('maps enqueued hook events to pending approvals', () => {
    const event: EnqueuedEvent = {
      id: 'evt_123',
      enqueued_at: Date.UTC(2026, 5, 15, 12, 0, 0),
      event: {
        tool_name: 'Bash',
        hook_event_name: 'PreToolUse',
        tool_input: { command: 'rm -rf node_modules/' },
      },
    };

    const pending = enqueuedEventToPendingApproval(event);
    expect(pending.actionId).toBe('evt_123');
    expect(pending.toolName).toBe('Bash');
    expect(pending.command).toBe('rm -rf node_modules/');
    expect(pending.reason).toBe('PreToolUse');
  });

  it('defaults cloud URL to fly production relay', () => {
    expect(DEFAULT_AGENTLEASH_CLOUD_URL).toBe('https://agentleash-cloud.fly.dev');
  });
});
