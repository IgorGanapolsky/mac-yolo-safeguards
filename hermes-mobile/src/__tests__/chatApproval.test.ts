import {
  CHAT_APPROVAL_DENY_TEXT,
  CHAT_APPROVAL_UNDO_TEXT,
  findPendingTextApproval,
  findUnresolvedUserApprovalPhrase,
  listInlineTextApprovals,
  parseApprovalNudgeFromContent,
  parseTargetMetadataNudge,
  type ChatPendingApproval,
  type ChatRunApproval,
} from '../utils/chatApproval';

describe('chatApproval', () => {
  it('parses Hermes approval nudge text and flexible formats', () => {
    const raw =
      '[Hermes Approval Nudge]\nNext-dollar score: 87\nReply exactly: APPROVE DEPLOY TRIAGE FIT\nTarget: Production triage';
    const parsed = parseApprovalNudgeFromContent(raw);
    expect(parsed?.approveText).toBe('APPROVE DEPLOY TRIAGE FIT');
    expect(parsed?.title).toBe('Production triage');

    expect(parseApprovalNudgeFromContent('Reply with exactly: APPROVE DEPLOY TRIAGE FIT')?.approveText).toBe('APPROVE DEPLOY TRIAGE FIT');
    expect(parseApprovalNudgeFromContent('please reply with exactly "APPROVE DEPLOY TRIAGE"') ?.approveText).toBe('APPROVE DEPLOY TRIAGE');
    expect(parseApprovalNudgeFromContent('Reply exactly APPROVE DEPLOY TRIAGE')?.approveText).toBe('APPROVE DEPLOY TRIAGE');
    expect(parseApprovalNudgeFromContent('Reply with exactly: APPROVE DEPLOY TRIAGE FIT.')?.approveText).toBe('APPROVE DEPLOY TRIAGE FIT');
  });

  it('parses Target metadata nudges without inline APPROVE line', () => {
    const meta = parseTargetMetadataNudge(
      'Target: SOFA Hermes API key configuration\nThread: https://agents.stackoverflow.com/t/123\nPrior alert message id: 3134',
    );
    expect(meta?.title).toBe('SOFA Hermes API key configuration');
  });

  it('finds pending text approval when user has not replied', () => {
    const pending = findPendingTextApproval([
      { role: 'assistant', content: 'Reply exactly: APPROVE DEPLOY TRIAGE FIT' },
    ]);
    expect(pending?.approveText).toBe('APPROVE DEPLOY TRIAGE FIT');
  });

  it('keeps pending after user typed approval text — tap Approve on the bubble', () => {
    const pending = findPendingTextApproval([
      { role: 'assistant', content: 'Reply exactly: APPROVE DEPLOY TRIAGE FIT' },
      { role: 'user', content: 'APPROVE DEPLOY TRIAGE FIT' },
    ]);
    expect(pending?.approveText).toBe('APPROVE DEPLOY TRIAGE FIT');
  });

  it('listInlineTextApprovals maps nudge messages by index', () => {
    const map = listInlineTextApprovals([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'Reply exactly: APPROVE SOFA OAUTH' },
    ]);
    expect(map.get(1)?.approveText).toBe('APPROVE SOFA OAUTH');
  });

  it('keeps inline on Target metadata even after user typed phrase (until resolved)', () => {
    const map = listInlineTextApprovals([
      {
        role: 'assistant',
        content:
          'Target: SOFA Hermes API key configuration\nThread: https://example.com\nPrior alert message id: 3134',
      },
      { role: 'user', content: 'APPROVE SOFA KEY ROTATE' },
    ]);
    expect(map.get(0)?.approveText).toBe('APPROVE SOFA KEY ROTATE');
  });

  it('resolved phrase hides Target metadata inline', () => {
    const resolved = new Set(['phrase:APPROVE SOFA KEY ROTATE']);
    const map = listInlineTextApprovals(
      [
        {
          role: 'assistant',
          content:
            'Target: SOFA Hermes API key configuration\nThread: https://example.com\nPrior alert message id: 3134',
        },
        { role: 'user', content: 'APPROVE SOFA KEY ROTATE' },
      ],
      resolved,
    );
    expect(map.size).toBe(0);
  });

  it('attaches inline approval to Target metadata via leash hint', () => {
    const map = listInlineTextApprovals(
      [
        {
          role: 'assistant',
          content:
            'Target: SOFA Hermes API key configuration\nThread: https://example.com\nPrior alert message id: 3134',
        },
      ],
      undefined,
      [{ phrase: 'APPROVE SOFA KEY ROTATE', title: 'SOFA Hermes API key configuration' }],
    );
    expect(map.get(0)?.approveText).toBe('APPROVE SOFA KEY ROTATE');
  });

  it('resolved keys hide inline nudges by phrase', () => {
    const resolved = new Set(['phrase:APPROVE DEPLOY TRIAGE FIT']);
    const pending = findPendingTextApproval(
      [{ role: 'assistant', content: 'Reply exactly: APPROVE DEPLOY TRIAGE FIT' }],
      resolved,
    );
    expect(pending).toBeNull();
  });

  it('findUnresolvedUserApprovalPhrase picks latest typed APPROVE when no assistant nudge', () => {
    const pending = findUnresolvedUserApprovalPhrase([
      { role: 'user', content: 'Are you hallucinating' },
      { role: 'user', content: 'APPROVE DEPLOY TRIAGE FIT' },
      { role: 'user', content: 'APPROVE SOFA OAUTH' },
    ]);
    expect(pending?.approveText).toBe('APPROVE SOFA OAUTH');
    expect(pending?.title).toBe('Confirm approval');
  });

  it('resolved keys hide unresolved user approval phrase', () => {
    const resolved = new Set(['phrase:APPROVE SOFA OAUTH']);
    const pending = findUnresolvedUserApprovalPhrase(
      [{ role: 'user', content: 'APPROVE SOFA OAUTH' }],
      resolved,
    );
    expect(pending).toBeNull();
  });

  it('undo and deny helper strings are defined', () => {
    expect(CHAT_APPROVAL_UNDO_TEXT).toContain('UNDO');
    expect(CHAT_APPROVAL_DENY_TEXT).toContain('DENY');
  });
});
