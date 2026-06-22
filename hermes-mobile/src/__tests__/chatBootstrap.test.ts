import type { HermesSession } from '../types/chat';
import {
  buildMobileChatSessionTitle,
  resolveMobileChatBootstrap,
} from '../utils/chatBootstrap';
import { isSmokeProbeSession } from '../utils/sessionSelection';

describe('chatBootstrap', () => {
  it('builds a mobile session title', () => {
    expect(buildMobileChatSessionTitle()).toContain('Hermes Mobile');
  });

  it('prefers existing Hermes Mobile sessions', () => {
    const mobile: HermesSession = {
      id: 'm1',
      title: 'Hermes Mobile — Jun 18',
      source: 'api',
    };
    const smoke: HermesSession = {
      id: 's1',
      title: 'CLI probe',
      preview: 'Reply with exactly OK',
      source: 'cli',
    };
    const plan = resolveMobileChatBootstrap([smoke, mobile]);
    expect(plan.mode).toBe('use');
    if (plan.mode === 'use') {
      expect(plan.session.id).toBe('m1');
    }
  });

  it('creates when only smoke sessions exist', () => {
    const smoke: HermesSession = {
      id: 's1',
      preview: 'Reply with exactly CODEX-RUNTIME-OK',
      source: 'cli',
    };
    expect(resolveMobileChatBootstrap([smoke]).mode).toBe('create');
    expect(isSmokeProbeSession(smoke)).toBe(true);
  });

  it('creates when only non-mobile cli sessions exist', () => {
    const cli: HermesSession = {
      id: 'cli-1',
      title: 'Fixing Ollama Context',
      source: 'cli',
    };
    expect(resolveMobileChatBootstrap([cli]).mode).toBe('create');
  });
});
