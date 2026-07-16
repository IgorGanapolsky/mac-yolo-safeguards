import {
  fleetComputerDisplayName,
  isFleetMacProName,
} from '../utils/fleetComputerNames';

describe('fleetComputerNames', () => {
  it('recognizes MacBook Pro hostnames as fleet Mac Pro', () => {
    expect(isFleetMacProName('Igors-MacBook-Pro')).toBe(true);
    expect(isFleetMacProName('Igors-MacBook-Pro.local')).toBe(true);
    expect(isFleetMacProName('igors-macbook-pro-1')).toBe(true);
    expect(isFleetMacProName('Mac Pro')).toBe(true);
    expect(isFleetMacProName('Igors-Mac-mini')).toBe(false);
  });

  it('appends (Mac Pro) fleet alias without duplicating', () => {
    expect(fleetComputerDisplayName('Igors-MacBook-Pro')).toBe('Igors-MacBook-Pro (Mac Pro)');
    expect(fleetComputerDisplayName('Igors-MacBook-Pro (Mac Pro)')).toBe(
      'Igors-MacBook-Pro (Mac Pro)',
    );
    expect(fleetComputerDisplayName('Mac Pro')).toBe('Mac Pro');
    expect(fleetComputerDisplayName('Igors-Mac-mini')).toBe('Igors-Mac-mini');
  });
});
