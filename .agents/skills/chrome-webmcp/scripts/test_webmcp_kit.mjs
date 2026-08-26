import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const registrations = [];
globalThis.document = {
  modelContext: {
    async registerTool(tool, options) {
      registrations.push({ tool, options });
    },
  },
};

const kitPath = new URL("../assets/webmcp-kit.js", import.meta.url);
const { registerWebMCPTool, validateWebMCPTool } = await import(pathToFileURL(kitPath.pathname));

assert.throws(
  () => validateWebMCPTool({ name: "x".repeat(31), description: "x", inputSchema: { type: "object", properties: {} }, risk: "read", execute() {} }),
  /tool name/,
);

await assert.rejects(
  registerWebMCPTool({ name: "write_state", description: "Writes state.", inputSchema: { type: "object", properties: {} }, risk: "write", execute() {} }),
  /confirm callback/,
);

const handle = await registerWebMCPTool({
  name: "read_status",
  description: "Returns status.",
  inputSchema: { type: "object", properties: {} },
  risk: "read",
  untrustedContentHint: false,
  execute: async () => ({ ok: true }),
});
assert.equal(handle.available, true);
assert.equal(registrations.length, 1);
assert.deepEqual(registrations[0].tool.annotations, { readOnlyHint: true, untrustedContentHint: false });
assert.equal(await registrations[0].tool.execute({}), '{"ok":true}');
handle.unregister();
assert.equal(registrations[0].options.signal.aborted, true);

let mutations = 0;
const denied = await registerWebMCPTool({
  name: "write_status",
  description: "Writes status after confirmation.",
  inputSchema: { type: "object", properties: {} },
  risk: "write",
  confirm: async () => false,
  execute: async () => {
    mutations += 1;
    return { ok: true };
  },
});
assert.equal(await registrations[1].tool.execute({}), '{"ok":false,"error":"user_confirmation_required"}');
assert.equal(mutations, 0);
denied.unregister();

const bounded = await registerWebMCPTool({
  name: "read_large_status",
  description: "Returns an intentionally large result for the output guard test.",
  inputSchema: { type: "object", properties: {} },
  risk: "read",
  execute: async () => "x".repeat(1501),
});
assert.equal(await registrations[2].tool.execute({}), '{"ok":false,"error":"tool_output_exceeds_1500_characters"}');
bounded.unregister();

delete globalThis.document.modelContext;
const unavailable = await registerWebMCPTool({
  name: "read_fallback",
  description: "Tests progressive fallback.",
  inputSchema: { type: "object", properties: {} },
  risk: "read",
  execute: async () => ({ ok: true }),
});
assert.deepEqual(unavailable, { available: false, reason: "document.modelContext_unavailable" });

console.log("webmcp-kit: PASS");
