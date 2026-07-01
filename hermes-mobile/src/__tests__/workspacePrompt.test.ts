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
  });

  it('buildWorkspaceSystemPrompt is generic and echoes the active path', () => {
    const wp = buildWorkspaceSystemPrompt('/srv/project-x');
    expect(wp).toContain('Active workspace: /srv/project-x');
    expect(wp).toContain('the operator');
    expect(wp).not.toContain('Igor');
  });

  it('workspaceDisplayName returns the last path segment', () => {
    expect(workspaceDisplayName('/Users/example/workspace/ThumbGate/')).toBe('ThumbGate');
    expect(workspaceDisplayName('')).toBe('Workspace');
  });
});
