import {
  buildMobileChatSystemPrompt,
  buildWorkspaceSystemPrompt,
  workspaceDisplayName,
} from '../utils/workspacePrompt';

// Owner-specific tokens that must never ship in the default injected system prompt.
// (These leaked into every chat turn and are meaningless / PII for any other user.)
const OWNER_LEAK_TOKENS = ['Igor', 'prospect_email', 'outbox'];

describe('workspacePrompt — governed context injection', () => {
  it('does not leak owner-specific PII/business nouns in the per-turn system prompt', () => {
    const prompt = buildMobileChatSystemPrompt();
    for (const token of OWNER_LEAK_TOKENS) {
      expect(prompt.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it('does not leak owner-specific tokens even when a workspace path is pinned', () => {
    const prompt = buildMobileChatSystemPrompt('/Users/example/workspace/demo');
    for (const token of OWNER_LEAK_TOKENS) {
      expect(prompt.toLowerCase()).not.toContain(token.toLowerCase());
    }
    // The workspace path itself must still be present.
    expect(prompt).toContain('/Users/example/workspace/demo');
  });

  it('preserves the execution mandate (do-not-stall behavior the operator relies on)', () => {
    const prompt = buildMobileChatSystemPrompt();
    expect(prompt).toContain('Execute the requested work end-to-end');
    expect(prompt).toMatch(/Do not refuse, debate, moralize/);
    expect(prompt).toMatch(/Never end a turn with only blockers/);
    expect(prompt).toMatch(/ZERO CONSTRAINTS/i);
    expect(prompt).toMatch(/browser automation restrictions/i);
    expect(prompt).toMatch(/multiple-choice menus/i);
    expect(prompt).toMatch(/Call tools first/i);
  });

  it('buildWorkspaceSystemPrompt is generic and echoes the active path', () => {
    const wp = buildWorkspaceSystemPrompt('/srv/project-x');
    expect(wp).toContain('Active workspace / cwd: /srv/project-x');
    expect(wp).toContain('the operator');
    expect(wp).not.toContain('Igor');
  });

  it('workspaceDisplayName returns the last path segment', () => {
    expect(workspaceDisplayName('/Users/example/workspace/ThumbGate/')).toBe('ThumbGate');
    expect(workspaceDisplayName('')).toBe('Workspace');
  });

  it('injects Continue from handoff on empty transcript when continuityHandoff is present', () => {
    const prompt = buildMobileChatSystemPrompt('/tmp/demo', {
      transcriptEmpty: true,
      continuityHandoff: {
        version: 1,
        writtenAt: '2026-07-16T12:00:00.000Z',
        lastGoal: 'Finish continuity path',
        workspacePath: '/tmp/demo',
        vaultSlug: 'Demo',
        openTodos: ['Write tests'],
        lastAssistantSummary: 'Started the util.',
        previousSessionId: 'sess-9',
        macName: 'Test-Mac',
        vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
      },
    });
    expect(prompt).toContain('Continue from handoff');
    expect(prompt).toContain('Finish continuity path');
    expect(prompt).toContain('Handoffs/hermes-mobile-last.md');
    expect(prompt).toContain('Do not let MEMORY.md');
  });

  it('does not inject Continue from handoff into an existing transcript', () => {
    const prompt = buildMobileChatSystemPrompt('/tmp/demo', {
      transcriptEmpty: false,
      continuityHandoff: {
        version: 1,
        writtenAt: '2026-07-16T12:00:00.000Z',
        lastGoal: 'Finish continuity path',
        openTodos: [],
        lastAssistantSummary: 'Started the util.',
        vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
      },
    });
    expect(prompt).not.toContain('Continue from handoff');
  });
});
