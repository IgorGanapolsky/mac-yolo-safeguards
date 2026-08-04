import { ASC_SAFE_REVIEW_NOTES } from '../../scripts/asc-review-notes-safe';

describe('ASC safe review notes template', () => {
  it('describes real pairing only — no demo path (zero demo forever)', () => {
    expect(ASC_SAFE_REVIEW_NOTES).toContain('macOS, Linux, or Windows');
    expect(ASC_SAFE_REVIEW_NOTES).toMatch(/QR|pair|Connect/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toContain('Demo mode');
    expect(ASC_SAFE_REVIEW_NOTES).not.toContain('hermes://setup?demo=1');
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/ts\.net/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/100\.\d+\.\d+\.\d+/);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/sk-hermes/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/Set the API key/i);
    expect(ASC_SAFE_REVIEW_NOTES).not.toMatch(/Gateway URL to:/i);
  });
});
