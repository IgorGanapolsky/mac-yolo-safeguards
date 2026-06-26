import {
  enqueuedEventToPendingApproval,
  DEFAULT_HERMES_MOBILE_CLOUD_URL,
  normalizeRelayWorkers,
  resolveActiveRelayWorkerId,
} from '../services/mobileRelayClient';
import type { EnqueuedEvent } from '../types/mobileRelay';

describe('mobileRelayClient', () => {
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

  it('defaults cloud URL to live production relay', () => {
    expect(DEFAULT_HERMES_MOBILE_CLOUD_URL).toBe('https://hermesmobile-cloud.fly.dev');
  });

  it('normalizes relay workers from worker payloads and dedupes ids', () => {
    const workers = normalizeRelayWorkers({
      events: [],
      workers: [
        { id: 'mac-mini', hostname: 'Mac-mini.local' },
        { id: 'mac-mini', hostname: 'duplicate.local' },
        { id: '', hostname: 'missing-id.local' },
      ],
      active_worker_id: 'mac-mini',
    });

    expect(workers).toHaveLength(1);
    expect(workers[0]?.id).toBe('mac-mini');
    expect(resolveActiveRelayWorkerId({ events: [], active_worker_id: 'mac-mini' }, workers)).toBe(
      'mac-mini',
    );
  });

  it('falls back to devices and chooses an online worker when active id is absent', () => {
    const workers = normalizeRelayWorkers({
      events: [],
      devices: [
        { id: 'mac-pro', status: 'idle' },
        { id: 'mac-mini', status: 'online' },
      ],
    });

    expect(resolveActiveRelayWorkerId({ events: [] }, workers)).toBe('mac-mini');
  });
});
