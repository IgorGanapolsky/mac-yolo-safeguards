import AsyncStorage from '@react-native-async-storage/async-storage';

const ATTRIBUTION_KEY = 'hermes.marketing.attribution.v1';
const MAX_VALUE_LENGTH = 140;

export type ConversionWindow = 'day0' | 'day7';

export type MarketingAttributionTouch = {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  adNetwork?: string;
  campaignId?: string;
  adgroupId?: string;
  creativeId?: string;
  conversionWindow: ConversionWindow;
  clickedAt: string;
};

type MarketingAttributionState = {
  firstTouch: MarketingAttributionTouch;
  lastTouch: MarketingAttributionTouch;
};

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

function cleanValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_VALUE_LENGTH);
}

function searchParamsFromUrl(url: string): URLSearchParams | null {
  try {
    return new URL(url).searchParams;
  } catch {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return null;
    const hashStart = url.indexOf('#', queryStart);
    const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
    return new URLSearchParams(query);
  }
}

function param(params: URLSearchParams, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = cleanValue(params.get(name));
    if (value) return value;
  }
  return undefined;
}

function inferConversionWindow(params: URLSearchParams, campaign?: string): ConversionWindow {
  const explicit = param(params, 'conversion_window', 'attribution_window', 'window');
  const value = `${explicit ?? ''} ${campaign ?? ''}`.toLowerCase();
  if (value.includes('day7') || value.includes('d7') || value.includes('retarget')) {
    return 'day7';
  }
  return 'day0';
}

function parseTouch(url: string, nowMs: number): MarketingAttributionTouch | null {
  const params = searchParamsFromUrl(url);
  if (!params) return null;

  const source = param(params, 'utm_source', 'source', 'ad_source');
  const campaign = param(params, 'utm_campaign', 'campaign', 'campaign_name');
  const adNetwork = param(params, 'ad_network', 'network', 'utm_network');
  if (!source && !campaign && !adNetwork) {
    return null;
  }

  const resolvedSource = source ?? adNetwork ?? 'unknown';
  return {
    source: resolvedSource,
    medium: param(params, 'utm_medium', 'medium'),
    campaign,
    content: param(params, 'utm_content', 'content'),
    term: param(params, 'utm_term', 'term'),
    adNetwork,
    campaignId: param(params, 'campaign_id', 'campaignId'),
    adgroupId: param(params, 'adgroup_id', 'adgroupId', 'ad_set_id', 'adset_id'),
    creativeId: param(params, 'creative_id', 'creativeId', 'ad_id'),
    conversionWindow: inferConversionWindow(params, campaign),
    clickedAt: new Date(nowMs).toISOString(),
  };
}

async function readState(): Promise<MarketingAttributionState | null> {
  try {
    const raw = await AsyncStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MarketingAttributionState;
  } catch {
    return null;
  }
}

export async function recordAttributionFromUrl(
  url: string,
  nowMs = Date.now(),
): Promise<MarketingAttributionTouch | null> {
  const touch = parseTouch(url, nowMs);
  if (!touch) return null;

  try {
    const existing = await readState();
    const next: MarketingAttributionState = {
      firstTouch: existing?.firstTouch ?? touch,
      lastTouch: touch,
    };
    await AsyncStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    return touch;
  }

  return touch;
}

function ageHours(touch: MarketingAttributionTouch, nowMs: number): number | undefined {
  const clicked = Date.parse(touch.clickedAt);
  if (!Number.isFinite(clicked)) return undefined;
  return Math.max(0, Math.round(((nowMs - clicked) / 3_600_000) * 10) / 10);
}

export async function getMarketingAttributionProperties(
  nowMs = Date.now(),
): Promise<AnalyticsProperties> {
  const state = await readState();
  if (!state) return {};

  const last = state.lastTouch;
  const first = state.firstTouch;
  return {
    attribution_source: last.source,
    attribution_medium: last.medium,
    attribution_campaign: last.campaign,
    attribution_content: last.content,
    attribution_term: last.term,
    attribution_ad_network: last.adNetwork,
    attribution_campaign_id: last.campaignId,
    attribution_adgroup_id: last.adgroupId,
    attribution_creative_id: last.creativeId,
    attribution_window: last.conversionWindow,
    attribution_age_hours: ageHours(last, nowMs),
    first_attribution_source: first.source,
    first_attribution_campaign: first.campaign,
    first_attribution_window: first.conversionWindow,
  };
}

export async function clearMarketingAttribution(): Promise<void> {
  await AsyncStorage.removeItem(ATTRIBUTION_KEY);
}
