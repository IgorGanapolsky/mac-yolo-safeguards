/**
 * Dead thumbgate.app checkout paths. The live pages are on thumbgate.ai.
 * Destinations are a fixed map so the query string cannot change the host.
 */
const LEGACY_CHECKOUT_DESTINATIONS: Record<string, string> = {
  "/diagnostic": "https://thumbgate.ai/diagnostic",
  "/go/pro": "https://thumbgate.ai/go/pro",
  "/go/pro-direct": "https://thumbgate.ai/go/pro-direct",
};

export function legacyCheckoutRedirectTarget(url: URL): string | null {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const base = LEGACY_CHECKOUT_DESTINATIONS[path];
  if (!base) return null;
  const target = new URL(base);
  target.search = url.search;
  return target.toString();
}
