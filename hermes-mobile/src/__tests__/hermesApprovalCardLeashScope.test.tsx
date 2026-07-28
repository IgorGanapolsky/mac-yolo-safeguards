import React from 'react';
import { render } from '@testing-library/react-native';
import HermesApprovalCard from '../components/HermesApprovalCard';
import type { HermesApprovalRequest } from '../types/approval';

/**
 * The Leash screen is where approvals are actually answered, so a policy that changes nothing
 * there changes nothing that matters. The scope row used to be suppressed whenever the thumbs
 * rendered (`!showThumbs`), which is exactly the leash case — reported as a P1 on #1132.
 *
 * Thumbs are unchanged (they drive ThumbGate capture and mean approve-once / deny); these tests
 * pin that the scope row now ADDS only what the policy AND the transport actually permit.
 */
const approval: HermesApprovalRequest = {
  id: 'a1',
  source: 'gateway_guard',
  title: 'Run migration',
  allowPermanent: true,
  riskTier: 'low',
};

const renderLeash = (props: Partial<React.ComponentProps<typeof HermesApprovalCard>> = {}) =>
  render(
    <HermesApprovalCard
      approval={approval}
      variant="leash"
      onChoice={jest.fn()}
      {...props}
    />,
  );

describe('HermesApprovalCard leash scope row', () => {
  it('shows the permanent rule on the leash card under autonomous', () => {
    const { queryByTestId } = renderLeash({ approvalPolicy: 'autonomous' });
    expect(queryByTestId('approval-always')).not.toBeNull();
    expect(queryByTestId('approval-session')).not.toBeNull();
  });

  it('shows only the session scope under balanced — no permanent rule', () => {
    const { queryByTestId } = renderLeash({ approvalPolicy: 'balanced' });
    expect(queryByTestId('approval-session')).not.toBeNull();
    expect(queryByTestId('approval-always')).toBeNull();
  });

  it('shows no scope row at all under strict', () => {
    const { queryByTestId } = renderLeash({ approvalPolicy: 'strict' });
    expect(queryByTestId('approval-session')).toBeNull();
    expect(queryByTestId('approval-always')).toBeNull();
  });

  it('hides the scope row over the relay even under autonomous', () => {
    const { queryByTestId } = renderLeash({
      approvalPolicy: 'autonomous',
      canPersistDecision: false,
    });
    expect(queryByTestId('approval-session')).toBeNull();
    expect(queryByTestId('approval-always')).toBeNull();
  });

  it('makes the three policies visibly distinct on the leash card', () => {
    const shown = (['strict', 'balanced', 'autonomous'] as const).map((policy) => {
      const { queryByTestId } = renderLeash({ approvalPolicy: policy });
      return [queryByTestId('approval-session') ? 'session' : '', queryByTestId('approval-always') ? 'always' : '']
        .filter(Boolean)
        .join(',');
    });
    expect(new Set(shown).size).toBe(3);
  });
});
