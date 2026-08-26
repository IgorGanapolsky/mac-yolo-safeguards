const LIMITS = Object.freeze({ name: 30, description: 500, parameterDescription: 150, output: 1500 });

function assertText(value, label, maximum) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must contain 1-${maximum} characters`);
  }
}

function validateSchema(schema) {
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object") {
    throw new TypeError("inputSchema must be an object schema with properties");
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    assertText(name, "parameter name", LIMITS.name);
    if (property?.description !== undefined) {
      assertText(property.description, `description for ${name}`, LIMITS.parameterDescription);
    }
  }
}

function boundedResult(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (typeof serialized !== "string") throw new TypeError("tool result must be serializable");
  if (serialized.length > LIMITS.output) {
    return JSON.stringify({ ok: false, error: "tool_output_exceeds_1500_characters" });
  }
  return serialized;
}

export function validateWebMCPTool(tool) {
  assertText(tool?.name, "tool name", LIMITS.name);
  assertText(tool?.description, "tool description", LIMITS.description);
  validateSchema(tool?.inputSchema);
  if (!['read', 'write', 'external'].includes(tool?.risk)) {
    throw new TypeError("risk must be read, write, or external");
  }
  if (tool.risk !== "read" && typeof tool.confirm !== "function") {
    throw new TypeError("write and external tools require a confirm callback");
  }
  if (typeof tool.execute !== "function") throw new TypeError("execute must be a function");
}

export async function registerWebMCPTool(tool, options = {}) {
  validateWebMCPTool(tool);
  const modelContext = globalThis.document?.modelContext;
  if (!modelContext) return { available: false, reason: "document.modelContext_unavailable" };

  const exposedTo = options.exposedTo ?? [];
  for (const origin of exposedTo) {
    if (!/^https:\/\/[^/]+$/u.test(origin)) throw new TypeError("exposedTo entries must be secure origins");
  }

  const controller = new AbortController();
  const definition = {
    name: tool.name,
    title: tool.title ?? tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: tool.risk === "read",
      untrustedContentHint: Boolean(tool.untrustedContentHint),
    },
    execute: async (args, context) => {
      if (tool.risk !== "read") {
        const confirmed = await tool.confirm({ name: tool.name, args });
        if (!confirmed) return JSON.stringify({ ok: false, error: "user_confirmation_required" });
      }
      return boundedResult(await tool.execute(args, context));
    },
  };

  await modelContext.registerTool(definition, { signal: controller.signal, ...(exposedTo.length ? { exposedTo } : {}) });
  return { available: true, unregister: () => controller.abort() };
}

export { LIMITS };
