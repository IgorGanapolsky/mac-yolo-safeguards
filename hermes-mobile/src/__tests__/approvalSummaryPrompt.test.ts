import { buildApprovalSummaryPrompt } from '../utils/approvalSummaryPrompt';

describe('buildApprovalSummaryPrompt', () => {
  const FIXED_HEADER = [
    'You are Hermes Leash. Summarize this ThumbGate-blocked tool call for a human operator.',
    'Focus on: what would run, blast radius, and whether approve is reasonable.',
    'Keep under 3 sentences. Redact secrets and paths if present.',
  ];

  it('builds a prompt with the fixed guidance header, tool line, diff label, and body', () => {
    const prompt = buildApprovalSummaryPrompt('rm -rf /tmp/foo', 'Bash');
    const lines = prompt.split('\n');

    expect(lines.slice(0, 3)).toEqual(FIXED_HEADER);
    expect(lines[3]).toBe('Tool: Bash');
    expect(lines[4]).toBe('Diff:');
    expect(lines[5]).toBe('rm -rf /tmp/foo');
    // Exactly header(3) + tool + label + body = 6 lines for a single-line diff.
    expect(lines).toHaveLength(6);
  });

  it('falls back to "unknown_tool" when toolName is omitted', () => {
    const prompt = buildApprovalSummaryPrompt('some diff');
    expect(prompt).toContain('Tool: unknown_tool');
  });

  it('falls back to "unknown_tool" when toolName is empty or whitespace-only', () => {
    expect(buildApprovalSummaryPrompt('d', '')).toContain('Tool: unknown_tool');
    expect(buildApprovalSummaryPrompt('d', '   ')).toContain('Tool: unknown_tool');
    expect(buildApprovalSummaryPrompt('d', '\t\n ')).toContain('Tool: unknown_tool');
  });

  it('trims surrounding whitespace from a provided toolName', () => {
    const prompt = buildApprovalSummaryPrompt('d', '  Edit  ');
    expect(prompt).toContain('Tool: Edit');
    expect(prompt).not.toContain('Tool:   Edit');
  });

  it('trims surrounding whitespace from the diff body', () => {
    const prompt = buildApprovalSummaryPrompt('   git push --force   ', 'Bash');
    const lines = prompt.split('\n');
    expect(lines[5]).toBe('git push --force');
  });

  it('renders "(empty)" as the body when the diff is an empty string', () => {
    const prompt = buildApprovalSummaryPrompt('', 'Bash');
    const lines = prompt.split('\n');
    expect(lines[4]).toBe('Diff:');
    expect(lines[5]).toBe('(empty)');
  });

  it('renders "(empty)" when the diff is only whitespace', () => {
    const prompt = buildApprovalSummaryPrompt('   \n\t  ', 'Bash');
    const lines = prompt.split('\n');
    expect(lines[5]).toBe('(empty)');
  });

  it('preserves internal newlines of a multi-line diff', () => {
    const diff = 'line one\nline two\nline three';
    const prompt = buildApprovalSummaryPrompt(diff, 'Write');
    const lines = prompt.split('\n');
    // header(3) + Tool + Diff: + 3 body lines = 8
    expect(lines).toHaveLength(8);
    expect(lines.slice(5)).toEqual(['line one', 'line two', 'line three']);
  });

  it('truncates the diff body to at most 4000 characters', () => {
    const huge = 'a'.repeat(5000);
    const prompt = buildApprovalSummaryPrompt(huge, 'Bash');
    const lines = prompt.split('\n');
    const body = lines[5];
    expect(body).toHaveLength(4000);
    expect(body).toBe('a'.repeat(4000));
    expect(prompt).not.toContain('a'.repeat(4001));
  });

  it('trims before truncating so leading whitespace does not consume the budget', () => {
    const diff = '   ' + 'b'.repeat(4100);
    const prompt = buildApprovalSummaryPrompt(diff, 'Bash');
    const body = prompt.split('\n')[5];
    expect(body).toHaveLength(4000);
    expect(body.startsWith('b')).toBe(true);
  });

  it('always returns a single string joined by newlines', () => {
    const prompt = buildApprovalSummaryPrompt('x', 'y');
    expect(typeof prompt).toBe('string');
    expect(prompt.split('\n')[0]).toBe(FIXED_HEADER[0]);
  });
});
