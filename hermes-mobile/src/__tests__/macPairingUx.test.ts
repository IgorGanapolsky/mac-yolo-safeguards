import {
  HERMES_MAC_GET_STARTED_URL,
  MAC_GETTING_STARTED_STEPS,
  MAC_QR_PAIRING_STEPS,
  macPairingHeadingForVariant,
  macPairingStepsForVariant,
} from '../utils/macPairingUx';

describe('macPairingUx', () => {
  it('documents consumer getting-started steps without terminal commands', () => {
    const bodies = MAC_GETTING_STARTED_STEPS.map((s) => s.body).join(' ');
    expect(bodies.toLowerCase()).not.toContain('bash');
    expect(bodies.toLowerCase()).not.toContain('terminal');
    expect(MAC_GETTING_STARTED_STEPS.length).toBe(4);
    expect(MAC_GETTING_STARTED_STEPS[3].title).toMatch(/Search/i);
  });

  it('documents QR pairing in plain language', () => {
    const bodies = MAC_QR_PAIRING_STEPS.map((s) => s.body).join(' ');
    expect(bodies).toContain('Connect phone');
    expect(bodies.toLowerCase()).not.toContain('bash');
  });

  it('selects steps by variant', () => {
    expect(macPairingStepsForVariant('getting-started', true).length).toBe(3);
    expect(macPairingStepsForVariant('qr-pairing', false).length).toBe(3);
    expect(macPairingHeadingForVariant('getting-started')).toContain('New to Hermes');
  });

  it('links to public Hermes Mac docs', () => {
    expect(HERMES_MAC_GET_STARTED_URL).toMatch(/^https:\/\//);
  });
});
