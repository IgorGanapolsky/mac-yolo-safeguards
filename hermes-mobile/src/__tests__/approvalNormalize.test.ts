import { fromPendingApproval } from '../utils/approvalNormalize';
import type { PendingApproval } from '../types/gateway';

function makePending(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    actionId: 'act_1',
    toolName: 'run_command',
    reason: 'List files',
    command: 'ls -la',
    receivedAt: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('fromPendingApproval', () => {
  describe('run_ id detection', () => {
    it('derives runId from actionId when it starts with run_', () => {
      const req = fromPendingApproval(makePending({ actionId: 'run_abc123' }));
      expect(req.runId).toBe('run_abc123');
      expect(req.id).toBe('run_abc123');
    });

    it('leaves runId undefined when actionId is not a run id', () => {
      const req = fromPendingApproval(makePending({ actionId: 'session-42' }));
      expect(req.runId).toBeUndefined();
      expect(req.id).toBe('session-42');
    });

    it('prefers an explicit runId over the actionId heuristic', () => {
      const req = fromPendingApproval(
        makePending({ actionId: 'run_should_be_ignored', runId: 'run_explicit' }),
      );
      expect(req.runId).toBe('run_explicit');
      // id always mirrors actionId, independent of runId.
      expect(req.id).toBe('run_should_be_ignored');
    });

    it('honors an explicit runId even when actionId is a session key', () => {
      const req = fromPendingApproval(
        makePending({ actionId: 'session-key', runId: 'run_from_stream' }),
      );
      expect(req.runId).toBe('run_from_stream');
    });
  });

  describe('source defaulting', () => {
    it('defaults to gateway_guard when no approveText and no source', () => {
      const req = fromPendingApproval(makePending({ approveText: undefined }));
      expect(req.source).toBe('gateway_guard');
    });

    it('defaults to text_nudge when approveText is present', () => {
      const req = fromPendingApproval(makePending({ approveText: 'yes proceed' }));
      expect(req.source).toBe('text_nudge');
    });

    it('respects an explicit source over the approveText heuristic', () => {
      const req = fromPendingApproval(
        makePending({ approveText: 'yes proceed', source: 'relay_hook' }),
      );
      expect(req.source).toBe('relay_hook');
    });
  });

  describe('risk-tier inference', () => {
    it('infers high risk from a destructive command', () => {
      const req = fromPendingApproval(
        makePending({ command: 'rm -rf /tmp/data', reason: 'cleanup' }),
      );
      expect(req.riskTier).toBe('high');
    });

    it('infers high risk from a production deploy in the reason text', () => {
      const req = fromPendingApproval(
        makePending({ command: undefined, reason: 'vercel --prod release' }),
      );
      expect(req.riskTier).toBe('high');
    });

    it('infers medium risk from a git push', () => {
      const req = fromPendingApproval(
        makePending({ command: 'git push origin main', reason: 'ship it' }),
      );
      expect(req.riskTier).toBe('medium');
    });

    it('infers low risk from a benign command', () => {
      const req = fromPendingApproval(
        makePending({ command: 'ls -la', reason: 'list files' }),
      );
      expect(req.riskTier).toBe('low');
    });

    it('respects an explicit riskTier over inference', () => {
      const req = fromPendingApproval(
        makePending({ command: 'rm -rf /', riskTier: 'low' }),
      );
      expect(req.riskTier).toBe('low');
    });
  });

  describe('rollback hint', () => {
    it('derives a rollback hint from an inferred high risk tier', () => {
      const req = fromPendingApproval(makePending({ command: 'rm -rf /tmp/x' }));
      expect(req.rollbackHint).toContain('Rollback');
    });

    it('leaves rollbackHint undefined for low risk with no explicit hint', () => {
      const req = fromPendingApproval(makePending({ command: 'ls' }));
      expect(req.rollbackHint).toBeUndefined();
    });

    it('respects an explicit rollbackHint', () => {
      const req = fromPendingApproval(
        makePending({ command: 'rm -rf /', rollbackHint: 'call ops' }),
      );
      expect(req.rollbackHint).toBe('call ops');
    });
  });

  describe('allowPermanent defaulting', () => {
    it('defaults allowPermanent to true for gateway_guard source', () => {
      const req = fromPendingApproval(makePending({ approveText: undefined }));
      expect(req.allowPermanent).toBe(true);
    });

    it('defaults allowPermanent to false for text_nudge source', () => {
      const req = fromPendingApproval(makePending({ approveText: 'proceed' }));
      expect(req.allowPermanent).toBe(false);
    });

    it('respects an explicit allowPermanent=false even for gateway_guard', () => {
      const req = fromPendingApproval(makePending({ allowPermanent: false }));
      expect(req.allowPermanent).toBe(false);
    });

    it('respects an explicit allowPermanent=true even for a text nudge', () => {
      const req = fromPendingApproval(
        makePending({ approveText: 'proceed', allowPermanent: true }),
      );
      expect(req.allowPermanent).toBe(true);
    });
  });

  describe('field passthrough', () => {
    it('copies transport metadata onto the normalized request', () => {
      const pending = makePending({
        actionId: 'run_meta',
        toolName: 'shell',
        reason: 'do a thing',
        command: 'echo hi',
        workspacePath: '/repo',
        approveText: undefined,
        receivedAt: '2026-07-03T12:00:00.000Z',
        sessionKey: 'sess-99',
        diff: '--- a\n+++ b',
      });
      const req = fromPendingApproval(pending);
      expect(req).toMatchObject({
        id: 'run_meta',
        toolName: 'shell',
        title: 'do a thing',
        reason: 'do a thing',
        command: 'echo hi',
        workspacePath: '/repo',
        receivedAt: '2026-07-03T12:00:00.000Z',
        sessionKey: 'sess-99',
        diff: '--- a\n+++ b',
      });
    });

    it('uses the reason as the title', () => {
      const req = fromPendingApproval(makePending({ reason: 'Approve deploy?' }));
      expect(req.title).toBe('Approve deploy?');
    });
  });

  describe('policy enrichment', () => {
    it('returns the base request unchanged when no policy is given', () => {
      const req = fromPendingApproval(
        makePending({ command: 'rm -rf /', allowPermanent: true }),
      );
      // High risk + gateway_guard: without policy, allowPermanent stays as provided.
      expect(req.allowPermanent).toBe(true);
    });

    it('strict policy strips allowPermanent', () => {
      const req = fromPendingApproval(
        makePending({ command: 'ls', allowPermanent: true }),
        'strict',
      );
      expect(req.allowPermanent).toBe(false);
    });

    it('autonomous policy preserves allowPermanent for a gateway guard', () => {
      const req = fromPendingApproval(
        makePending({ command: 'ls', allowPermanent: true }),
        'autonomous',
      );
      expect(req.allowPermanent).toBe(true);
    });

    it('enrichment fills a missing risk tier under a policy', () => {
      const req = fromPendingApproval(
        makePending({ command: 'git push', riskTier: undefined }),
        'balanced',
      );
      expect(req.riskTier).toBe('medium');
      expect(req.rollbackHint).toContain('Rollback');
    });
  });
});
