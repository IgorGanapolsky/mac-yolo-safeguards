import { isAutomationProbeText, isGatewaySmokeTestMessage } from '../utils/gatewaySmokeMessages';

describe('gatewaySmokeMessages', () => {
  it('flags telegram and codex runtime smoke probes', () => {
    expect(isGatewaySmokeTestMessage('Reply with exactly TELEGRAM-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('Reply with exactly CODEX-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('Reply with exactly\nCODEX-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('Reply   with   exactly\nTELEGRAM-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('Reply with exactly: OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('Reply with exactly: TELEGRAM-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('CODEX-RUNTIME-OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('HERMES-YOLO-READY')).toBe(true);
  });

  it('allows normal chat text', () => {
    expect(isGatewaySmokeTestMessage('What is the yolo-health score?')).toBe(false);
    expect(isGatewaySmokeTestMessage('OK then lets ship it')).toBe(false);
    expect(isGatewaySmokeTestMessage('Reply exactly: APPROVE DEPLOY TRIAGE FIT')).toBe(false);
    expect(isGatewaySmokeTestMessage('Reply with exactly: APPROVE DEPLOY TRIAGE FIT')).toBe(false);
  });

  it('flags automated probe replies', () => {
    expect(isGatewaySmokeTestMessage('OK')).toBe(true);
    expect(isGatewaySmokeTestMessage('TELEGRAM-RUNTIME-OK')).toBe(true);
  });

  it('isAutomationProbeText flags harness exact-reply probes', () => {
    expect(isAutomationProbeText('Reply with exactly: GUARDRAILS OK')).toBe(true);
    expect(isAutomationProbeText('Use no tools. Reply with exactly: MUSE-DIRECT')).toBe(true);
    expect(isAutomationProbeText('Do not use tools. Reply with exactly INSTALLED_LOCAL_OK')).toBe(true);
    expect(isAutomationProbeText('Do not use tools. Reply with exactly T147_DEFAULT_LOCAL_OK')).toBe(true);
    expect(isAutomationProbeText('Reply with exactly LOCAL3B_OK')).toBe(true);
    expect(isAutomationProbeText('Reply with exactly HERMES-YOLO-LOCAL-RESCUE')).toBe(true);
  });

  it('isAutomationProbeText flags hostname/sysctl shell smoke prompts', () => {
    expect(
      isAutomationProbeText("Run the shell command 'hostname' and report its exact output..."),
    ).toBe(true);
    expect(isAutomationProbeText("Run 'sysctl -n hw.ncpu' and report the exact number.")).toBe(true);
    expect(isAutomationProbeText("Run 'uname -m' and report the exact output.")).toBe(true);
    expect(isAutomationProbeText('Run the command date and report its output.')).toBe(true);
  });

  it('isAutomationProbeText keeps user prompts and approval nudges visible', () => {
    expect(isAutomationProbeText('Reply with exactly: APPROVE DEPLOY TRIAGE FIT')).toBe(false);
    expect(isAutomationProbeText('is our mobile app following best practices?')).toBe(false);
    expect(isAutomationProbeText('Copy-Paste Failure on Mac Mini')).toBe(false);
    expect(isAutomationProbeText('Reply with exactly what I told you earlier about the plan')).toBe(false);
    expect(isAutomationProbeText('')).toBe(false);
  });
});
