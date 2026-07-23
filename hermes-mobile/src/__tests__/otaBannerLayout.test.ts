import {
  OTA_BANNER_CONTENT_PAD_TOP,
  OTA_BANNER_MIN_TAP_PT,
  otaBannerActionMinSize,
  otaBannerTopPadding,
} from '../utils/otaBannerLayout';

describe('otaBannerLayout', () => {
  it('places banner content fully below the status-bar inset', () => {
    expect(otaBannerTopPadding(0)).toBe(OTA_BANNER_CONTENT_PAD_TOP);
    expect(otaBannerTopPadding(24)).toBe(24 + OTA_BANNER_CONTENT_PAD_TOP);
    expect(otaBannerTopPadding(47)).toBe(47 + OTA_BANNER_CONTENT_PAD_TOP);
  });

  it('never uses a negative inset', () => {
    expect(otaBannerTopPadding(-10)).toBe(OTA_BANNER_CONTENT_PAD_TOP);
    expect(otaBannerTopPadding(Number.NaN)).toBe(OTA_BANNER_CONTENT_PAD_TOP);
  });

  it('keeps Restart/dismiss at least 44pt', () => {
    expect(otaBannerActionMinSize()).toBe(OTA_BANNER_MIN_TAP_PT);
    expect(OTA_BANNER_MIN_TAP_PT).toBeGreaterThanOrEqual(44);
  });
});
