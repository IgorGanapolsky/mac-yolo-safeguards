/**
 * Lightweight runtime schema validation for API routes (Worker-safe).
 * Mirrors tools/hermes-schema-validator.js — no external deps / no Node require.
 */

type SchemaField = {
  __schema: true;
  type: string;
  required?: boolean;
  max?: number;
  min?: number;
  label?: string;
  default?: unknown;
  values?: string[];
  itemSchema?: SchemaField;
  properties?: Record<string, SchemaField>;
  strict?: boolean;
};

function field(type: string, opts: Record<string, unknown> = {}): SchemaField {
  return { __schema: true, type, ...opts } as SchemaField;
}

const Schema = {
  string(opts: Record<string, unknown> = {}) {
    return field("string", opts);
  },
  number(opts: Record<string, unknown> = {}) {
    return field("number", opts);
  },
  boolean(opts: Record<string, unknown> = {}) {
    return field("boolean", opts);
  },
  enum(values: string[], opts: Record<string, unknown> = {}) {
    return field("enum", { values, ...opts });
  },
  array(itemSchema: SchemaField, opts: Record<string, unknown> = {}) {
    return field("array", { itemSchema, ...opts });
  },
  object(properties: Record<string, SchemaField>, opts: Record<string, unknown> = {}) {
    return field("object", { properties, ...opts });
  },
  uuid(opts: Record<string, unknown> = {}) {
    return field("uuid", opts);
  },
};

function validate(value: unknown, schema: SchemaField): { ok: boolean; value?: unknown; error?: string } {
  if (!schema || !schema.__schema) {
    return { ok: false, error: "Invalid schema definition" };
  }
  if (value === null || value === undefined) {
    if (schema.required) return { ok: false, error: "Field is required" };
    return { ok: true, value: schema.default !== undefined ? schema.default : undefined };
  }
  switch (schema.type) {
    case "string":
      return validateString(value, schema);
    case "number":
      return validateNumber(value, schema);
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true, value }
        : { ok: false, error: `Expected boolean, got ${typeof value}` };
    case "enum":
      if (!schema.values?.includes(String(value))) {
        return { ok: false, error: `Must be one of: ${(schema.values || []).join(", ")}` };
      }
      return { ok: true, value: String(value) };
    case "uuid": {
      const v = String(value || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
        return { ok: false, error: `${schema.label || "Field"} must be a valid UUID` };
      }
      return { ok: true, value: v };
    }
    case "array":
      return validateArray(value, schema);
    case "object":
      return validateObject(value, schema);
    default:
      return { ok: false, error: `Unknown schema type: ${schema.type}` };
  }
}

function validateString(value: unknown, schema: SchemaField) {
  if (typeof value !== "string") {
    return { ok: false, error: `Expected string, got ${typeof value}` };
  }
  if (schema.max !== undefined && value.length > schema.max) {
    return { ok: false, error: `${schema.label || "Field"} must be at most ${schema.max} characters` };
  }
  if (schema.min !== undefined && value.length < schema.min) {
    return { ok: false, error: `${schema.label || "Field"} must be at least ${schema.min} characters` };
  }
  return { ok: true, value };
}

function validateNumber(value: unknown, schema: SchemaField) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return { ok: false, error: `Expected number, got ${typeof value}` };
  }
  if (schema.max !== undefined && value > schema.max) {
    return { ok: false, error: `${schema.label || "Field"} must be ≤ ${schema.max}` };
  }
  if (schema.min !== undefined && value < schema.min) {
    return { ok: false, error: `${schema.label || "Field"} must be ≥ ${schema.min}` };
  }
  return { ok: true, value };
}

function validateArray(value: unknown, schema: SchemaField) {
  if (!Array.isArray(value)) {
    return { ok: false, error: `Expected array, got ${typeof value}` };
  }
  if (schema.max !== undefined && value.length > schema.max) {
    return { ok: false, error: `Array must have at most ${schema.max} items` };
  }
  if (schema.min !== undefined && value.length < schema.min) {
    return { ok: false, error: `Array must have at least ${schema.min} items` };
  }
  if (!schema.itemSchema) return { ok: true, value };
  const results: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const r = validate(value[i], schema.itemSchema);
    if (!r.ok) return { ok: false, error: `[${i}] ${r.error}` };
    results.push(r.value);
  }
  return { ok: true, value: results };
}

function validateObject(value: unknown, schema: SchemaField) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `Expected object, got ${Array.isArray(value) ? "array" : typeof value}` };
  }
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const properties = schema.properties || {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const r = validate(obj[key], propSchema);
    if (!r.ok) {
      return {
        ok: false,
        error: propSchema.label ? `${propSchema.label}: ${r.error}` : `${key}: ${r.error}`,
      };
    }
    if (r.value !== undefined) result[key] = r.value;
  }
  if (schema.strict) {
    for (const key of Object.keys(obj)) {
      if (!(key in properties)) {
        return { ok: false, error: `Unknown field: ${key}` };
      }
    }
  }
  return { ok: true, value: result };
}

export const RouteSchemas = {
  createTask: Schema.object({
    prompt: Schema.string({ required: true, max: 24000, label: "prompt" }),
    threadId: Schema.string({ required: false, max: 160, label: "threadId" }),
    deviceId: Schema.string({ required: false, max: 160, label: "deviceId" }),
    idempotencyKey: Schema.string({ required: false, max: 120, label: "idempotencyKey" }),
    traceId: Schema.string({ required: false, max: 64, label: "traceId" }),
    routePreference: Schema.enum(["local", "cloud", "auto"], {
      required: false,
      label: "routePreference",
    }),
  }),
  feedback: Schema.object({
    taskId: Schema.string({ required: true, max: 160, label: "taskId" }),
    signal: Schema.enum(["up", "down"], { required: true, label: "signal" }),
    note: Schema.string({ required: false, max: 2000, label: "note" }),
  }),
  pairingStart: Schema.object({
    deviceName: Schema.string({ required: true, max: 120, label: "deviceName" }),
  }),
  pairingApprove: Schema.object({
    userCode: Schema.string({ required: true, max: 20, label: "userCode" }),
  }),
  threadRename: Schema.object({
    title: Schema.string({ required: true, max: 200, label: "title" }),
  }),
};

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  errors: string[];
}

/** Validate a request body against a schema (value first for TS call sites). */
export function validateRoute<T = unknown>(
  schema: unknown,
  input: unknown,
): ValidationResult<T> {
  const result = validate(input, schema as SchemaField);
  return {
    ok: result.ok,
    value: result.ok ? (result.value as T) : null,
    errors: result.ok ? [] : [result.error || "validation failed"],
  };
}
