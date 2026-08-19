import { describe, it, expect } from "vitest";
import {
  generateTraceId,
  generateSpanId,
  startSpan,
  endSpan,
  setAttribute,
  setError,
  extractTraceContext,
  injectTraceContext,
  makeRequestLogEntry,
  traceparentFor,
  spanFromTraceparent,
  TRACEPARENT_RE,
} from "@/lib/tracing";
import type { TraceContext } from "@/lib/tracing";

describe("tracing — ID generation", () => {
  it("generateTraceId produces 32-char lowercase hex", () => {
    const id = generateTraceId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toBe("00000000000000000000000000000000");
  });

  it("generateSpanId produces 16-char lowercase hex", () => {
    const id = generateSpanId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).not.toBe("0000000000000000");
  });

  it("generates unique IDs on repeated calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe("tracing — span lifecycle", () => {
  it("startSpan generates new traceId and spanId", () => {
    const span = startSpan("test-op");
    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
    expect(span.name).toBe("test-op");
    expect(span.kind).toBe("server");
    expect(span.status).toBe("ok");
    expect(span.endTime).toBeUndefined();
    expect(span.startTime).toBeTypeOf("number");
  });

  it("startSpan with parent reuses traceId, no parentSpanId = orphan", () => {
    const span = startSpan("child-op", undefined, {});
    expect(span.parentSpanId).toBeUndefined();
  });

  it("startSpan with parent context propagates traceId", () => {
    const parent: TraceContext = { traceId: "aa".repeat(16), spanId: "bb".repeat(8) };
    const span = startSpan("child-op", parent, { foo: "bar" });
    expect(span.traceId).toBe("aa".repeat(16));
    expect(span.parentSpanId).toBe("bb".repeat(8));
    expect(span.attributes).toEqual({ foo: "bar" });
  });

  it("endSpan sets endTime and status", () => {
    const span = startSpan("op");
    const ended = endSpan(span, "error", "something broke");
    expect(ended.endTime).toBeTypeOf("number");
    expect(ended.endTime! >= span.startTime).toBe(true);
    expect(ended.status).toBe("error");
    expect(ended.statusMessage).toBe("something broke");
  });

  it("setAttribute mutates span in-place", () => {
    const span = startSpan("op");
    setAttribute(span, "http.status_code", 500);
    expect(span.attributes["http.status_code"]).toBe(500);
  });

  it("setError marks span as error", () => {
    const span = startSpan("op");
    setError(span, new Error("DB connection refused"));
    expect(span.status).toBe("error");
    expect(span.statusMessage).toBe("DB connection refused");
    expect(span.attributes["error"]).toBe(true);
  });
});

describe("tracing — trace context propagation", () => {
  it("extractTraceContext parses W3C traceparent header", () => {
    const headers = new Headers();
    headers.set("traceparent", "00-0af7651916cd43dd8448eb211c803199-00f067aa0ba902b7-01");
    const ctx = extractTraceContext(headers);
    expect(ctx).toEqual({
      traceId: "0af7651916cd43dd8448eb211c803199",
      spanId: "00f067aa0ba902b7",
      traceFlags: "01",
    });
  });

  it("extractTraceContext parses fallback x-trace-id / x-span-id headers", () => {
    const headers: Record<string, string> = {
      "x-trace-id": "deadbeef",
      "x-span-id": "cafebabe",
    };
    const ctx = extractTraceContext(headers);
    expect(ctx).toEqual({
      traceId: "deadbeef",
      spanId: "cafebabe",
    });
  });

  it("extractTraceContext returns undefined when no trace headers", () => {
    const headers = new Headers();
    expect(extractTraceContext(headers)).toBeUndefined();
  });

  it("extractTraceContext handles plain object headers", () => {
    const headers = { "traceparent": "00-0af7651916cd43dd8448eb211c803199-00f067aa0ba902b7-01" };
    const ctx = extractTraceContext(headers);
    expect(ctx?.traceId).toBe("0af7651916cd43dd8448eb211c803199");
  });

  it("injectTraceContext sets traceparent and x-trace-id on Headers", () => {
    const span = startSpan("op");
    const headers = new Headers();
    injectTraceContext(span, headers);
    expect(headers.get("traceparent")).toBe(`00-${span.traceId}-${span.spanId}-01`);
    expect(headers.get("x-trace-id")).toBe(span.traceId);
  });

  it("injectTraceContext sets traceparent on plain object", () => {
    const span = startSpan("op");
    const headers: Record<string, string> = {};
    injectTraceContext(span, headers);
    expect(headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(headers["x-trace-id"]).toBe(span.traceId);
  });
});

describe("tracing — request logging", () => {
  it("makeRequestLogEntry captures trace context + timing", () => {
    const span = startSpan("GET /api/admin/metrics");
    endSpan(span);
    const entry = makeRequestLogEntry(span, "GET", "/api/admin/metrics", 200, 42);
    expect(entry.traceId).toBe(span.traceId);
    expect(entry.spanId).toBe(span.spanId);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/admin/metrics");
    expect(entry.status).toBe(200);
    expect(entry.durationMs).toBe(42);
    expect(entry.error).toBeUndefined();
  });

  it("makeRequestLogEntry includes error when present", () => {
    const span = startSpan("GET /api/health");
    endSpan(span);
    const entry = makeRequestLogEntry(span, "GET", "/api/health", 500, 100, "DB timeout");
    expect(entry.error).toBe("DB timeout");
  });
});

describe("tracing — traceparent helpers", () => {
  it("traceparentFor produces W3C format", () => {
    const span = startSpan("op");
    const tp = traceparentFor(span);
    expect(tp).toBe(`00-${span.traceId}-${span.spanId}-01`);
    expect(TRACEPARENT_RE.test(tp)).toBe(true);
  });

  it("spanFromTraceparent round-trips", () => {
    const original = startSpan("op");
    const tp = traceparentFor(original);
    const recovered = spanFromTraceparent(tp);
    expect(recovered).toBeDefined();
    expect(recovered!.traceId).toBe(original.traceId);
    expect(recovered!.spanId).toBe(original.spanId);
    expect(recovered!.traceFlags).toBe("01");
  });

  it("spanFromTraceparent returns undefined for invalid format", () => {
    expect(spanFromTraceparent("garbage")).toBeUndefined();
    expect(spanFromTraceparent("")).toBeUndefined();
  });
});
