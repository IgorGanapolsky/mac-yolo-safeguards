import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMarketingAttribution,
  getMarketingAttributionProperties,
  recordAttributionFromUrl,
} from '../services/marketingAttribution';

describe('marketingAttribution', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearMarketingAttribution();
  });

  it('ignores URLs without campaign attribution', async () => {
    await expect(recordAttributionFromUrl('hermes://chat?session=abc')).resolves.toBeNull();
    await expect(getMarketingAttributionProperties()).resolves.toEqual({});
  });

  it('persists first touch and updates last touch', async () => {
    await recordAttributionFromUrl(
      'hermes://chat?utm_source=applovin&utm_medium=cpp&utm_campaign=day0-paywall&campaign_id=c1',
      Date.parse('2026-07-01T12:00:00Z'),
    );
    await recordAttributionFromUrl(
      'hermes://leash?utm_source=applovin&utm_medium=roas&utm_campaign=day7-retarget&creative_id=cr2',
      Date.parse('2026-07-01T18:00:00Z'),
    );

    const props = await getMarketingAttributionProperties(Date.parse('2026-07-02T00:00:00Z'));
    expect(props.first_attribution_source).toBe('applovin');
    expect(props.first_attribution_campaign).toBe('day0-paywall');
    expect(props.attribution_medium).toBe('roas');
    expect(props.attribution_campaign).toBe('day7-retarget');
    expect(props.attribution_creative_id).toBe('cr2');
    expect(props.attribution_window).toBe('day7');
    expect(props.attribution_age_hours).toBe(6);
  });

  it('accepts ad-network-only links for paid campaigns', async () => {
    const touch = await recordAttributionFromUrl(
      'hermes://chat?network=applovin&campaign_id=install-01&adgroup_id=owners',
      Date.parse('2026-07-01T12:00:00Z'),
    );

    expect(touch?.source).toBe('applovin');
    const props = await getMarketingAttributionProperties();
    expect(props.attribution_source).toBe('applovin');
    expect(props.attribution_campaign_id).toBe('install-01');
    expect(props.attribution_adgroup_id).toBe('owners');
  });
});
