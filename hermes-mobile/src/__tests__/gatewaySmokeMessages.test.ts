import { isGatewaySmokeTestMessage } from '../utils/gatewaySmokeMessages';

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
});
