import {
  buildSessionGreeting,
  resolvePresentationState,
} from '../utils/presentationMode';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('resolvePresentationState', () => {
  it('returns demo mode when demoMode is on', () => {
    const state = resolvePresentationState({ ...DEFAULT_GATEWAY_SETTINGS, demoMode: true });
    expect(state.mode).toBe('demo');
    expect(state.visualsOn).toBe(true);
  });

  it('returns audio-first when glance mode is on', () => {
    const state = resolvePresentationState({
      ...DEFAULT_GATEWAY_SETTINGS,
      demoMode: false,
      glanceMode: true,
    });
    expect(state.mode).toBe('audio-first');
    expect(state.visualsOn).toBe(false);
    expect(state.preferAudioFeedback).toBe(true);
  });

  it('returns visual mode by default', () => {
    const state = resolvePresentationState({
      ...DEFAULT_GATEWAY_SETTINGS,
      demoMode: false,
      glanceMode: false,
    });
    expect(state.mode).toBe('visual');
    expect(state.visualsOn).toBe(true);
  });
});

describe('buildSessionGreeting', () => {
  it('mentions pending approvals when count > 0', () => {
    expect(
      buildSessionGreeting({
        pendingCount: 2,
        healthLevel: 'green',
        connectionState: 'connected',
        glanceMode: false,
      }),
    ).toContain('2 pending approvals');
  });

  it('uses glance phrasing when glance mode is on', () => {
    expect(
      buildSessionGreeting({
        pendingCount: 0,
        healthLevel: 'green',
        connectionState: 'connected',
        glanceMode: true,
      }),
    ).toContain('No pending approvals');
  });

  it('reports blocked gateway health', () => {
    expect(
      buildSessionGreeting({
        pendingCount: 0,
        healthLevel: 'red',
        connectionState: 'connected',
        glanceMode: false,
      }),
    ).toContain('Gateway unreachable');
  });
});
