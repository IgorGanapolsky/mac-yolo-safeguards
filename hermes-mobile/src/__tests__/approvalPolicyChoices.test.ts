import {
  APPROVAL_CHOICE_LABELS,
  choicesForRequest,
  policyChoicePreview,
} from '../types/approval';
import type { ApprovalPolicy, HermesApprovalRequest } from '../types/approval';

/**
 * `choicesForRequest` is the ONLY thing the Settings "Approval policy" toggle affects, and it had
 * no test coverage at all — which is how it shipped with `autonomous` returning fewer choices than
 * `balanced` for low-risk requests (i.e. autonomous behaved exactly like strict). Igor saw the
 * symptom on a physical device: toggling the chips appeared to change nothing.
 */

const gatewayRequest = (over: Partial<HermesApprovalRequest> = {}): HermesApprovalRequest => ({
  id: 'a1',
  source: 'gateway_guard',
  title: 'Run migration',
  allowPermanent: true,
  riskTier: 'low',
  ...over,
});

const POLICIES: ApprovalPolicy[] = ['strict', 'balanced', 'autonomous'];

describe('choicesForRequest', () => {
  it('gives each policy a DISTINCT set of buttons — the toggle must be observable', () => {
    const rendered = POLICIES.map((p) => choicesForRequest(gatewayRequest(), p).join(','));
    expect(new Set(rendered).size).toBe(POLICIES.length);
  });

  it('is monotonic: raising the policy only ever ADDS choices', () => {
    const [strict, balanced, autonomous] = POLICIES.map((p) =>
      choicesForRequest(gatewayRequest(), p),
    );
    expect(strict.every((c) => balanced.includes(c))).toBe(true);
    expect(balanced.every((c) => autonomous.includes(c))).toBe(true);
    expect(autonomous.length).toBeGreaterThan(balanced.length);
    expect(balanced.length).toBeGreaterThan(strict.length);
  });

  it('offers the permanent "always" rule ONLY under autonomous', () => {
    expect(choicesForRequest(gatewayRequest(), 'strict')).not.toContain('always');
    expect(choicesForRequest(gatewayRequest(), 'balanced')).not.toContain('always');
    expect(choicesForRequest(gatewayRequest(), 'autonomous')).toContain('always');
  });

  it('regression: autonomous is never stricter than balanced for a LOW-risk request', () => {
    // The exact shape of the old bug — autonomous + riskTier 'low' returned ['once','deny'].
    const low = gatewayRequest({ riskTier: 'low' });
    expect(choicesForRequest(low, 'autonomous')).not.toEqual(choicesForRequest(low, 'strict'));
    expect(choicesForRequest(low, 'autonomous').length).toBeGreaterThanOrEqual(
      choicesForRequest(low, 'balanced').length,
    );
  });

  it('applies the same ladder at every risk tier', () => {
    (['low', 'medium', 'high'] as const).forEach((riskTier) => {
      const req = gatewayRequest({ riskTier });
      expect(choicesForRequest(req, 'strict')).toEqual(['once', 'deny']);
      expect(choicesForRequest(req, 'balanced')).toEqual(['once', 'session', 'deny']);
      expect(choicesForRequest(req, 'autonomous')).toEqual(['once', 'session', 'always', 'deny']);
    });
  });

  it('lets the GATEWAY veto a lasting rule regardless of policy', () => {
    const noPermanent = gatewayRequest({ allowPermanent: false });
    POLICIES.forEach((p) => {
      expect(choicesForRequest(noPermanent, p)).toEqual(['once', 'deny']);
    });
  });

  it('keeps a text nudge to once/deny under every policy — there is no rule to persist', () => {
    const nudge = gatewayRequest({ source: 'text_nudge' });
    POLICIES.forEach((p) => {
      expect(choicesForRequest(nudge, p)).toEqual(['once', 'deny']);
    });
  });

  it('defaults to balanced when no policy is passed', () => {
    expect(choicesForRequest(gatewayRequest())).toEqual(
      choicesForRequest(gatewayRequest(), 'balanced'),
    );
  });
});

describe('policyChoicePreview', () => {
  it('produces a different, labellable preview for each policy', () => {
    const labelled = POLICIES.map((p) =>
      policyChoicePreview(p)
        .map((c) => APPROVAL_CHOICE_LABELS[c])
        .join(' · '),
    );
    expect(new Set(labelled).size).toBe(POLICIES.length);
    labelled.forEach((line) => expect(line).not.toContain('undefined'));
    expect(labelled[0]).toBe('Once · Deny');
    expect(labelled[2]).toContain('Always allow');
  });

  it('matches what a real gateway approval would offer', () => {
    POLICIES.forEach((p) => {
      expect(policyChoicePreview(p)).toEqual(choicesForRequest(gatewayRequest(), p));
    });
  });
});

/**
 * Transport veto. GatewayContext.submitApprovalChoice collapses every non-deny choice to a single
 * `allow` verdict when connectionMode === 'relay' (`choice === 'deny' ? 'block' : 'allow'`), so a
 * lasting scope cannot survive that wire. Rendering "Always allow" there would be a button that
 * silently does less than it says — the exact failure this change exists to remove.
 */
describe('choicesForRequest transport veto', () => {
  it('drops session/always when the transport cannot persist a decision', () => {
    POLICIES.forEach((p) => {
      const choices = choicesForRequest(gatewayRequest(), p, { canPersistDecision: false });
      expect(choices).toEqual(['once', 'deny']);
      expect(choices).not.toContain('always');
      expect(choices).not.toContain('session');
    });
  });

  it('does not let even autonomous override the transport', () => {
    expect(choicesForRequest(gatewayRequest(), 'autonomous', { canPersistDecision: false })).toEqual(
      ['once', 'deny'],
    );
  });

  it('is unchanged when the transport CAN persist (explicit true or omitted)', () => {
    POLICIES.forEach((p) => {
      const explicit = choicesForRequest(gatewayRequest(), p, { canPersistDecision: true });
      expect(explicit).toEqual(choicesForRequest(gatewayRequest(), p));
      expect(explicit).toEqual(choicesForRequest(gatewayRequest(), p, {}));
    });
  });
});
