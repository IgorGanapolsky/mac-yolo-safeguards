import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildWebMcpTools } from "../lib/webmcp-tools.mjs";

const component = fs.readFileSync(
  path.join(import.meta.dirname, "../app/WebMcpTools.tsx"),
  "utf8",
);
const layout = fs.readFileSync(path.join(import.meta.dirname, "../app/layout.tsx"), "utf8");
const spec = fs.readFileSync(
  path.join(import.meta.dirname, "../specs/webmcp-landing-tools.md"),
  "utf8",
);

test("exposes exactly two read-only WebMCP tools", () => {
  const tools = buildWebMcpTools({});
  assert.equal(tools.length, 2);
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["get_hermes_offer", "get_service_status"],
  );
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(typeof tool.description, "string");
    assert.equal(tool.inputSchema.type, "object");
  }
});

test("get_hermes_offer answers with the hosted Hermes offer", async () => {
  const [offer] = buildWebMcpTools({});
  const result = await offer.execute();
  assert.match(result, /hosted Hermes/);
  assert.match(result, /\$10\/month/);
  assert.match(result, /thumbgate\.app/);
  assert.match(result, /You own the work\. We own the machine\./);
});

test("get_service_status reads the same-origin health endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status: 200, text: async () => '{"ok":true}' };
  };
  const [, status] = buildWebMcpTools({ fetchImpl });
  const result = await status.execute();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/health");
  assert.equal(calls[0].init.method, "GET");
  assert.match(result, /HTTP 200/);
  assert.match(result, /"ok":true/);
});

test("get_service_status degrades instead of throwing", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  const [, status] = buildWebMcpTools({ fetchImpl });
  const result = await status.execute();
  assert.match(result, /status unavailable/);
});

test("component feature-detects and never auto-acts", () => {
  assert.match(component, /"use client"/);
  assert.match(component, /document as Document & \{ modelContext\?/);
  assert.match(component, /typeof modelContext\.registerTool !== "function"/);
  assert.match(component, /AbortController/);
  assert.doesNotMatch(component, /toolautosubmit/i);
  assert.doesNotMatch(component, /executeTool/);
});

test("spec pins the tool surface and price form", () => {
  assert.match(spec, /get_hermes_offer/);
  assert.match(spec, /get_service_status/);
  assert.match(spec, /\$10\/month/);
  assert.match(spec, /read-only/i);
  assert.match(spec, /\/api\/health/);
});

test("layout mounts the WebMCP hook", () => {
  assert.match(layout, /import \{ WebMcpTools \} from "\.\/WebMcpTools"/);
  assert.match(layout, /<WebMcpTools \/>/);
});
