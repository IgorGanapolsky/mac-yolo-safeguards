import { parseToolActivityDetails, toolActivityIcon } from '../utils/toolMessageDetails';

describe('toolMessageDetails', () => {
  it('maps tool icons by source', () => {
    expect(toolActivityIcon('web_search')).toBe('🔍');
    expect(toolActivityIcon('web_extract')).toBe('📄');
  });

  it('parses untrusted web_search payloads', () => {
    const raw = `<untrusted_tool_result source="web_search">
The following content was retrieved from an external source.
{"query":"skool ai automation","results":[{"url":"https://example.com/a"}]}
</untrusted_tool_result>`;
    const parsed = parseToolActivityDetails(raw, 'Search: example');
    expect(parsed?.toolName).toBe('web_search');
    expect(parsed?.detailRows.some((row) => row.label === 'QUERY' && row.value.includes('skool'))).toBe(
      true,
    );
    expect(parsed?.formattedPayload).toContain('"query"');
  });

  it('parses json tool payloads', () => {
    const parsed = parseToolActivityDetails('{"name":"run_command","command":"python3 report.py"}');
    expect(parsed?.toolName).toBe('run_command');
    expect(parsed?.summaryLine).toContain('python3 report.py');
  });
});
