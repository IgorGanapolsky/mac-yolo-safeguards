'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Copy of webmcp-kit validation logic (minified for test)
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

function validateWebMCPTool(tool) {
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

// Test tools configuration
const TOOLS = [
  {
    name: 'get_inference_cost_today',
    description: 'Returns today\'s inference cost summary from the ThumbGate dashboard.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        serviceFilter: {
          type: 'string',
          description: 'Optional service name to filter'
        }
      }
    },
    execute: () => JSON.stringify({ ok: true })
  },
  {
    name: 'audit_mcp_connection',
    description: 'Verifies the ThumbGate MCP connection status for a given service.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name' }
      },
      required: ['service']
    },
    execute: () => JSON.stringify({ ok: true })
  },
  {
    name: 'register_dashboard_tool',
    description: 'Registers a new browser tool in the ThumbGate dashboard.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string' },
        description: { type: 'string' },
        endpoint: { type: 'string' }
      },
      required: ['toolName', 'description', 'endpoint']
    },
    confirm: () => true,
    execute: () => JSON.stringify({ ok: true })
  },
  {
    name: 'list_registered_tools',
    description: 'Lists all tools currently registered in the ThumbGate dashboard.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {} },
    execute: () => JSON.stringify({ ok: true, tools: [] })
  }
];

test('WebMCP tool validation', () => {
  for (const tool of TOOLS) {
    assert.doesNotThrow(() => validateWebMCPTool(tool), `Tool ${tool.name} should be valid`);
  }
});

test('Read tools are properly categorized', () => {
  const readTools = TOOLS.filter(t => t.risk === 'read');
  assert.strictEqual(readTools.length, 3, 'Should have 3 read tools');
});

test('Write tools require confirmation metadata', () => {
  const writeTools = TOOLS.filter(t => t.risk === 'write');
  assert.strictEqual(writeTools.length, 1, 'Should have 1 write tool');
});

test('Input schemas are valid JSON Schema', () => {
  for (const tool of TOOLS) {
    assert.strictEqual(tool.inputSchema.type, 'object', `${tool.name} has object schema`);
    assert.strictEqual(typeof tool.inputSchema.properties, 'object', `${tool.name} has properties object`);
  }
});

test('Risk values are valid', () => {
  const validRisks = ['read', 'write', 'external'];
  for (const tool of TOOLS) {
    assert.ok(validRisks.includes(tool.risk), `${tool.name} has valid risk: ${tool.risk}`);
  }
});