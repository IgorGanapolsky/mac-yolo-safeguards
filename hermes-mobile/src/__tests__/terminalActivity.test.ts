import { extractTerminalActivityFromMessage, isTerminalToolName } from '../utils/terminalActivity';

describe('terminalActivity', () => {
  it('detects terminal tool names', () => {
    expect(isTerminalToolName('terminal')).toBe(true);
    expect(isTerminalToolName('web_search')).toBe(false);
  });

  it('extracts terminal command from tool messages', () => {
    const activity = extractTerminalActivityFromMessage({
      role: 'tool',
      content: 'run command: npm test',
      gatewayContent:
        '<untrusted_tool_result source="terminal">{"command":"npm test","output":"ok"}</untrusted_tool_result>',
    });
    expect(activity?.toolName).toBe('terminal');
    expect(activity?.command).toContain('npm test');
  });
});
