import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import {
  isTelegramSession,
  pickDefaultSession,
  sortSessionsForPicker,
  isMobileChatSession,
  isSmokeProbeSession,
  buildSessionPickerSections,
  sessionSourceLabel,
} from '../utils/sessionSelection';

const emptyProjectState: ChatProjectState = {
  projects: [],
  sessionProjectMap: {},
  activeProjectId: null,
};

describe('sessionSelection', () => {
  const telegramSession: HermesSession = {
    id: 'tg-1',
    source: 'telegram',
    title: 'Skool outreach',
    last_active: 1781717900,
    preview: 'Lead ID: lead_aryan-aryal',
  };

  const cliSession: HermesSession = {
    id: 'cli-1',
    source: 'cli',
    title: 'Fixing Ollama Context for Hermes Tool Use',
    last_active: 1781718000,
  };

  it('detects telegram sessions by source', () => {
    expect(isTelegramSession(telegramSession)).toBe(true);
    expect(isTelegramSession(cliSession)).toBe(false);
    
    const cliWithTelegramTitle: HermesSession = {
      id: 'cli-tg',
      source: 'cli',
      title: 'Fixing Telegram gateway sync issue',
      last_active: 1781718000,
    };
    expect(isTelegramSession(cliWithTelegramTitle)).toBe(false);
  });

  it('never returns smoke-only sessions as default', () => {
    const smoke: HermesSession = {
      id: 'smoke-1',
      source: 'cli',
      preview: 'Reply with exactly OK',
      last_active: 1781719000,
    };
    expect(pickDefaultSession([smoke], emptyProjectState)).toBeNull();
  });

  it('ignores project binding to smoke sessions', () => {
    const smoke: HermesSession = {
      id: 'smoke-1',
      source: 'cli',
      preview: 'Reply with exactly OK',
      last_active: 1781719000,
    };
    const state: ChatProjectState = {
      projects: [
        {
          id: 'proj-1',
          name: 'ThumbGate',
          workspacePath: '~/workspace/git/igor/ThumbGate',
          sessionIds: ['smoke-1'],
          activeSessionId: 'smoke-1',
        },
      ],
      sessionProjectMap: { 'smoke-1': 'proj-1' },
      activeProjectId: 'proj-1',
    };
    expect(pickDefaultSession([smoke], state)).toBeNull();
  });

  it('skips smoke probe cli sessions when picking default', () => {
    const smoke: HermesSession = {
      id: 'smoke-1',
      source: 'cli',
      preview: 'Reply with exactly OK',
      last_active: 1781719000,
    };
    const cliSession: HermesSession = {
      id: 'cli-1',
      source: 'cli',
      title: 'Fixing Ollama Context for Hermes Tool Use',
      last_active: 1781718000,
    };
    const picked = pickDefaultSession([smoke, cliSession], emptyProjectState);
    expect(picked?.id).toBe('cli-1');
  });
  it('prefers cli/mobile sessions over telegram when project has no binding', () => {
    const picked = pickDefaultSession([cliSession, telegramSession], emptyProjectState);
    expect(picked?.id).toBe('cli-1');
  });

  it('falls back to telegram when only telegram sessions exist', () => {
    const picked = pickDefaultSession([telegramSession], emptyProjectState);
    expect(picked?.id).toBe('tg-1');
  });

  it('respects project-bound session over telegram default', () => {
    const state: ChatProjectState = {
      projects: [
        {
          id: 'proj-1',
          name: 'ThumbGate',
          workspacePath: '~/workspace/git/igor/ThumbGate',
          sessionIds: ['cli-1'],
          activeSessionId: 'cli-1',
        },
      ],
      sessionProjectMap: { 'cli-1': 'proj-1' },
      activeProjectId: 'proj-1',
    };
    const picked = pickDefaultSession([cliSession, telegramSession], state);
    expect(picked?.id).toBe('cli-1');
  });

  it('sorts telegram and bound sessions to the top of the picker', () => {
    const state: ChatProjectState = {
      projects: [
        {
          id: 'proj-1',
          name: 'skool',
          workspacePath: '~/workspace/git/igor/skool_top1percent',
          sessionIds: ['cli-1'],
          activeSessionId: 'cli-1',
        },
      ],
      sessionProjectMap: { 'cli-1': 'proj-1' },
      activeProjectId: 'proj-1',
    };
    const sorted = sortSessionsForPicker([cliSession, telegramSession], state);
    expect(sorted[0].id).toBe('tg-1');
  });

  it('covers isSmokeProbeSession empty case', () => {
    const emptySess: HermesSession = { id: 'empty' };
    expect(isSmokeProbeSession(emptySess)).toBe(false);
  });

  it('covers isMobileChatSession', () => {
    const mobSess1: HermesSession = { id: 'm1', title: 'hermes mobile session' };
    const mobSess2: HermesSession = { id: 'm2', source: 'mobile session' };
    const normalSess: HermesSession = { id: 'n1', title: 'normal' };
    expect(isMobileChatSession(mobSess1)).toBe(true);
    expect(isMobileChatSession(mobSess2)).toBe(true);
    expect(isMobileChatSession(normalSess)).toBe(false);
  });

  it('covers pickDefaultSession empty case', () => {
    expect(pickDefaultSession([], emptyProjectState)).toBeNull();
  });

  it('covers pickDefaultSession mobile preference', () => {
    const mobSess: HermesSession = { id: 'm1', title: 'mobile session', last_active: 1781718000 };
    const otherSess: HermesSession = { id: 'o1', title: 'other', last_active: 1781717000 };
    const picked = pickDefaultSession([mobSess, otherSess], emptyProjectState);
    expect(picked?.id).toBe('m1');
  });

  it('builds grouped session picker sections', () => {
    const inbox: HermesSession = { id: '__telegram_inbox__', source: 'telegram' };
    const tg: HermesSession = { id: 'tg-1', source: 'telegram', last_active: 1781718000 };
    const cli: HermesSession = { id: 'cli-1', source: 'cli', last_active: 1781717000 };
    const smoke: HermesSession = {
      id: 'smoke-1',
      source: 'cli',
      title: 'telegram ingress smoke',
      last_active: 1781716000,
    };

    const sections = buildSessionPickerSections([inbox, tg, cli, smoke]);
    expect(sections.map((s) => s.key)).toEqual([
      'telegram-inbox',
      'telegram-threads',
      'chat',
      'smoke',
    ]);
    expect(sections[1]?.data[0]?.id).toBe('tg-1');
  });

  it('covers sessionSourceLabel helper', () => {
    const inboxSess: HermesSession = { id: '__telegram_inbox__' };
    const tgSess: HermesSession = { id: 't1', source: 'telegram' };
    const cliSess: HermesSession = { id: 'c1', source: 'cli' };
    const noSrcSess: HermesSession = { id: 'n1' };

    expect(sessionSourceLabel(inboxSess)).toBe('Telegram Inbox');
    expect(sessionSourceLabel(tgSess)).toBe('Telegram');
    expect(sessionSourceLabel(cliSess)).toBe('CLI');
    expect(sessionSourceLabel(noSrcSess)).toBeNull();
  });

  it('covers sorting bound and telegram sessions in picker', () => {
    const s1: HermesSession = { id: 's1', source: 'cli', last_active: 1781718000 };
    const s2: HermesSession = { id: 's2', source: 'telegram', last_active: 1781717000 };
    const s3: HermesSession = { id: 's3', source: 'cli', last_active: 1781716000 };
    const state: ChatProjectState = {
      projects: [
        {
          id: 'proj-1',
          name: 'skool',
          workspacePath: '~/workspace/git/igor/skool_top1percent',
          sessionIds: ['s3'],
          activeSessionId: 's3',
        },
      ],
      sessionProjectMap: { s3: 'proj-1' },
      activeProjectId: 'proj-1',
    };
    const sorted = sortSessionsForPicker([s1, s2, s3], state);
    expect(sorted[0].id).toBe('s2');
    expect(sorted[1].id).toBe('s3');
    expect(sorted[2].id).toBe('s1');
  });
});
