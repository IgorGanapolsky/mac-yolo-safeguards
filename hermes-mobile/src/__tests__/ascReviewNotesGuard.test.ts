import { findReviewNotesViolations } from '../../scripts/asc-review-notes-guard';

describe('ASC review notes guard', () => {
  it('flags operator infrastructure in review notes', () => {
    expect(findReviewNotesViolations('hermes://setup?demo=1')).toEqual([]);
    expect(findReviewNotesViolations('host igors-mac-mini.tail12aa33.ts.net')).toContain(
      'tailscale_hostname',
    );
    expect(findReviewNotesViolations('key sk-hermes-api-server-key')).toContain('hermes_api_key');
    expect(findReviewNotesViolations('key sk-hermes-local-dev')).toContain('hermes_api_key');
    expect(findReviewNotesViolations('Gateway URL to: http://100.94.135.78:8642')).toEqual(
      expect.arrayContaining(['tailscale_ipv4', 'gateway_url_instruction']),
    );
  });
});
