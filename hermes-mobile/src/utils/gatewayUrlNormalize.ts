/**
 * Leaf URL helpers shared by gatewayClient and gatewayUrlPolicy.
 *
 * Kept free of imports from either module so Metro/Hermes cannot hit the
 * gatewayClient ↔ gatewayUrlPolicy cycle that surfaces as
 * "undefined is not a function" in the UI ErrorBoundary (tip OTA 9af60b62).
 */

export interface NormalizedGatewayBase {
  httpBase: string;
  wsBase: string;
}

/** Strip /v1, /health paths so callers can paste tunnel URLs flexibly. */
export function normalizeGatewayUrl(input: string): NormalizedGatewayBase {
  let trimmed = input.trim().replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/health\/detailed$/, '');
  trimmed = trimmed.replace(/\/health$/, '');
  trimmed = trimmed.replace(/\/v1$/, '');
  trimmed = trimmed.replace(/\/+$/, '');

  if (!/^[a-zA-Z]+:\/\//.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  // Auto-append default Hermes port :8642 when an explicit port is absent on http scheme (e.g. raw IP -> http://IP:8642)
  if (/^http:\/\/[^/:]+$/i.test(trimmed)) {
    trimmed = `${trimmed}:8642`;
  }

  const wsBase = trimmed.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return { httpBase: trimmed, wsBase };
}
