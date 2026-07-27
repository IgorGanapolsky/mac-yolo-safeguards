import {
  stickActiveProfileToSetupPrimary,
  setupPrimaryStillActive,
} from '../utils/setupPairPrimaryStickiness';
import type { GatewayProfile, GatewayProfileState } from '../types/gatewayProfile';
import { upsertDiscoveredProfile } from '../services/gatewayProfiles';

function baseState(): GatewayProfileState {
  let state: GatewayProfileState = { profiles: [], activeProfileId: null };
  state = upsertDiscoveredProfile(
    state,
    {
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      label: 'Igors-Mac-mini',
    },
    true,
  );
  return state;
}

describe('setupPairPrimaryStickiness', () => {
  it('forces MacBook USB primary active after mini was sticky and extras remain catalog-only', () => {
    let state = baseState();
    expect(state.activeProfileId).toBeTruthy();

    state = upsertDiscoveredProfile(
      state,
      {
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        label: 'Igors-MacBook-Pro',
        localIp: '127.0.0.1',
      },
      true,
    );
    // Simulate extras upsert without activation (pair fleet mini)
    state = upsertDiscoveredProfile(
      state,
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        label: 'Igors-Mac-mini',
      },
      false,
    );

    // If dedupe/heal left mini active, stickiness restores MacBook primary
    state = { ...state, activeProfileId: state.profiles.find((p: GatewayProfile) => /mini/i.test(p.label))!.id };
    const stuck = stickActiveProfileToSetupPrimary(
      state,
      'http://127.0.0.1:8642',
      'Igors-MacBook-Pro',
    );
    const active = stuck.profiles.find((p: GatewayProfile) => p.id === stuck.activeProfileId);
    expect(active?.label).toMatch(/MacBook/i);
    expect(setupPrimaryStillActive(stuck, 'http://127.0.0.1:8642')).toBe(true);
  });

  it('is a no-op when primary is already active', () => {
    let state = baseState();
    state = upsertDiscoveredProfile(
      state,
      {
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        label: 'Igors-MacBook-Pro',
      },
      true,
    );
    const next = stickActiveProfileToSetupPrimary(
      state,
      'http://127.0.0.1:8642',
      'Igors-MacBook-Pro',
    );
    expect(next.activeProfileId).toBe(state.activeProfileId);
  });
});
