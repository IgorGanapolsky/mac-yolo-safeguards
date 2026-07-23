import {
  connectionStateForConnectingDisplay,
  isActiveConnectingDisplay,
} from '../utils/connectingStatusDisplay';

describe('connectingStatusDisplay', () => {
  it('keeps Connecting while the probe is still in the short window', () => {
    expect(isActiveConnectingDisplay('connecting', false)).toBe(true);
    expect(connectionStateForConnectingDisplay('connecting', false)).toBe('connecting');
  });

  it('demotes stuck Connecting to disconnected for picker/header labels', () => {
    expect(isActiveConnectingDisplay('connecting', true)).toBe(false);
    expect(connectionStateForConnectingDisplay('connecting', true)).toBe('disconnected');
  });

  it('leaves connected/demo/disconnected alone', () => {
    expect(connectionStateForConnectingDisplay('connected', true)).toBe('connected');
    expect(connectionStateForConnectingDisplay('demo', true)).toBe('demo');
    expect(connectionStateForConnectingDisplay('disconnected', true)).toBe('disconnected');
  });
});
