import { ASC_SAFE_REVIEW_NOTES } from '../../scripts/asc-review-notes-safe';

describe('ASC safe review notes template', () => {
  it('uses Settings demo mode — no operator infrastructure', () => {
    expect(ASC_SAFE_REVIEW_NOTES).toContain('Demo mode');
    expect(ASC_SAFE_REVIEW_NOTES).toContain('macOS, Linux, or Windows');
    expect(ASC_SAFE_REVIEW_NOTES).toContain('scanning a QR code');
    expect(ASC_SAFE_REVIEW_NOTES).toContain('hermes://setup?demo=1');
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/ts\.net/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/100\.\d+\.\d+\.\d+/);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/sk-hermes/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/Set the API key/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/Gateway URL to:/i);
  });
});
