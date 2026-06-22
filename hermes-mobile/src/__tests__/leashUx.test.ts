import {
  buildLeashEmptyExplanation,
  resolveInitialTab,
} from '../utils/leashUx';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('leashUx', () => {
  it('defaults to Chat tab when safety mode is off', () => {
    expect(resolveInitialTab(DEFAULT_GATEWAY_SETTINGS)).toBe('Chat');
  });

  it('opens Leash when safety or glance mode is on', () => {
    expect(resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true })).toBe('Leash');
    expect(resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, glanceMode: true })).toBe('Leash');
  });

  it('explains chat-first empty Leash when safety mode is off', () => {
    const text = buildLeashEmptyExplanation(DEFAULT_GATEWAY_SETTINGS);
    expect(text).toContain('Chat tab');
    expect(text).toContain('approvals.mode');
  });

  it('explains safety mode empty state', () => {
    const text = buildLeashEmptyExplanation({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true });
    expect(text).toContain('Safety mode is on');
  });
});
