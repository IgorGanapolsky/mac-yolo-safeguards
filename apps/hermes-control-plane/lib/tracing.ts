/**
 * tracing.ts — Lightweight distributed tracing primitives for ThumbGate.app
 * control-plane API routes.
 *
 * Designed for Cloudflare Workers (no Node.js-only APIs). Generates trace
 * IDs compatible with the W3C Trace Context format (32 lowercase hex chars),
 * span IDs (16 lowercase hex chars), and injects/extracts context via the
 * standard `traceparent` header plus fallback `x-trace-id`/`x-span-id`.
 *
 * When the OpenEtonomy Collector is present (traditional infra / Fly.io),
 * structured request logs with trace IDs flow into traces/ metrics/ logs
 * via the collector config at tools/otel-collector-config.yaml.
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags?: string;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "server" | "client" | "internal" | "producer" | "consumer";
  startTime: number; // monotonic nanoseconds (performance.time) or Date.now() ms
  endTime?: number;
  attributes: SpanAttributes;
  status: "ok" | "error";
  statusCode?: string;
  statusMessage?: string;
  traceFlags?: string; // W3C trace flags (e.g. "01" for sampled)
}

export interface RequestLogEntry {
  timestamp: number;
  traceId: string;
  spanId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
}

// --- ID generation (Web Crypto API — Cloudflare Workers safe) ---

const HEX = "0123456789abcdef";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    hex += HEX[(buf[i] >> 4) & 0xf] + HEX[buf[i] & 0xf];
  }
  return hex;
}

export function generateTraceId(): string {
  // W3C trace-id: 32 lowercase hex chars, not all zero.
  return randomHex(16);
}

export function generateSpanId(): string {
  // W3C span-id: 16 lowercase hex chars, not all zero.
  return randomHex(8);
}

// --- Trace context propagation ---

export const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Extract trace context from request headers.
 * Supports W3C `traceparent` header and fallback `x-trace-id` / `x-parent-span-id`.
 */
export function extractTraceContext(
  headerList: Headers | Record<string, string | string[] | undefined>,
): TraceContext | undefined {
  const headers =
    headerList instanceof Headers
      ? Object.fromEntries(headerList.entries())
      : headerList;

  const traceparent = headers["traceparent"];
  const tpStr = Array.isArray(traceparent) ? traceparent[0] : traceparent;
  if (tpStr) {
    const m = TRACEPARENT_RE.exec(tpStr);
    if (m) {
      return {
        traceId: m[2],
        spanId: m[3],
        traceFlags: m[4],
      };
    }
  }

  const traceId = getHeader(headers, "x-trace-id");
  const spanId = getHeader(headers, "x-span-id");
  if (traceId && spanId) {
    return { traceId, spanId };
  }

  return undefined;
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const val = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return val;
}

/**
 * Inject trace context into response headers for downstream propagation.
 */
export function injectTraceContext(
  span: Span,
  headerList: Headers | Record<string, string>,
): Headers | Record<string, string> {
  const traceId = span.traceId;
  const spanId = span.spanId;
  const traceFlags = span.traceFlags ?? "01";

  if (headerList instanceof Headers) {
    headerList.set("traceparent", `00-${traceId}-${spanId}-${traceFlags}`);
    headerList.set("x-trace-id", traceId);
    return headerList;
  }

  headerList["traceparent"] = `00-${traceId}-${spanId}-${traceFlags}`;
  headerList["x-trace-id"] = traceId;
  return headerList;
}

// --- Span lifecycle ---

export function startSpan(
  name: string,
  parent?: TraceContext,
  attributes: SpanAttributes = {},
  kind: Span["kind"] = "server",
): Span {
  return {
    traceId: parent?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId,
    name,
    kind,
    startTime: Date.now(),
    attributes,
    status: "ok",
  };
}

export function endSpan(
  span: Span,
  status: "ok" | "error" = "ok",
  statusMessage?: string,
): Span {
  return {
    ...span,
    endTime: Date.now(),
    status,
    ...(statusMessage ? { statusMessage } : {}),
  };
}

export function setAttribute(span: Span, key: string, value: string | number | boolean | undefined): void {
  span.attributes[key] = value;
}

export function setError(span: Span, error: string | Error): void {
  span.status = "error";
  span.statusMessage = error instanceof Error ? error.message : error;
  span.attributes["error"] = true;
}

// --- Request logging ---

export function makeRequestLogEntry(
  span: Span,
  method: string,
  path: string,
  status: number,
  durationMs: number,
  error?: string,
): RequestLogEntry {
  const entry: RequestLogEntry = {
    timestamp: Date.now(),
    traceId: span.traceId,
    spanId: span.spanId,
    method,
    path,
    status,
    durationMs,
  };
  if (error) entry.error = error;
  return entry;
}

/**
 * Create a traceparent string from a span (for downstream HTTP calls).
 */
export function traceparentFor(span: Span): string {
  return `00-${span.traceId}-${span.spanId}-${span.traceFlags ?? "01"}`;
}

/**
 * Build a Span from a traceparent header string (for receiving traced calls).
 */
export function spanFromTraceparent(traceparent: string): Span | undefined {
  const m = TRACEPARENT_RE.exec(traceparent);
  if (!m) return undefined;
  return {
    traceId: m[2],
    spanId: m[3],
    traceFlags: m[4],
    name: "incoming",
    kind: "server",
    startTime: Date.now(),
    attributes: {},
    status: "ok",
  };
}
