import { buildPersonaSystemPrompt, personaCopy, avatarCopy } from '../utils/hermesPersona';
import { buildMobileChatSystemPrompt } from '../utils/workspacePrompt';

describe('hermesPersona', () => {
  it('falls back to operator persona and orb avatar', () => {
    expect(personaCopy(undefined).key).toBe('operator');
    expect(avatarCopy(undefined).key).toBe('orb');
  });

  it('adds style guidance without removing execution directives', () => {
    const prompt = buildMobileChatSystemPrompt('/tmp/workspace', 'spark');

    expect(prompt).toContain('Standing orders');
    expect(prompt).toContain('playful technical partner');
    expect(prompt).toContain('Safety, scope, approval, and execution directives override persona');
    expect(prompt).toContain('/tmp/workspace');
  });

  it('generates bounded persona prompt copy', () => {
    expect(buildPersonaSystemPrompt('coach')).toContain('practical coach');
  });
});
