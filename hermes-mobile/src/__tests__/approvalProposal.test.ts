import {
  inferRiskTier,
  rollbackHintForRisk,
  toApprovalProposalJson,
  fromApprovalProposalJson,
  enrichApprovalRequest,
} from '../utils/approvalProposal';
import type { HermesApprovalRequest } from '../types/approval';

describe('approvalProposal', () => {
  it('infers high risk for prod deploy commands', () => {
    expect(inferRiskTier('vercel --prod --yes', 'Production triage')).toBe('high');
    expect(rollbackHintForRisk('high')).toContain('Rollback');
  });

  it('round-trips proposal JSON', () => {
    const request: HermesApprovalRequest = {
      id: 'run_abc',
      source: 'gateway_guard',
      runId: 'run_abc',
      title: 'Deploy',
      command: 'vercel --prod',
      allowPermanent: true,
    };
    const json = toApprovalProposalJson(request);
    const back = fromApprovalProposalJson(json);
    expect(back.runId).toBe('run_abc');
    expect(back.riskTier).toBe('high');
  });

  it('strict policy strips permanent allow', () => {
    const request: HermesApprovalRequest = {
      id: 'run_abc',
      source: 'gateway_guard',
      title: 'ls',
      allowPermanent: true,
    };
    const enriched = enrichApprovalRequest(request, 'strict');
    expect(enriched.allowPermanent).toBe(false);
  });
});
