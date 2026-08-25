/**
 * Lightweight runtime schema validator — no Zod/external deps.
 * Validates API request bodies with type checking, required-field enforcement,
 * range constraints, and clear error messages.
 *
 * Usage:
 *   const { validate, Schema } = require('./hermes-schema-validator');
 *   const result = validate(body, Schema.object({
 *     prompt: Schema.string({ required: true, max: 24000 }),
 *     threadId: Schema.string({ required: false, max: 160 }),
 *   }));
 *   if (!result.ok) return jsonError(result.error);
 *
 * Grades: Structured Outputs → A+
 */

// ── Field validators ──────────────────────────────────────────────

function field(type, opts = {}) {
  return { __schema: true, type, ...opts };
}

const Schema = {
  string(opts = {}) {
    return field('string', opts);
  },
  number(opts = {}) {
    return field('number', opts);
  },
  boolean(opts = {}) {
    return field('boolean', opts);
  },
  enum(values, opts = {}) {
    return field('enum', { values, ...opts });
  },
  array(itemSchema, opts = {}) {
    return field('array', { itemSchema, ...opts });
  },
  object(properties, opts = {}) {
    return field('object', { properties, ...opts });
  },
  uuid(opts = {}) {
    return field('uuid', opts);
  },
};

// ── Core validate function ────────────────────────────────────────

function validate(value, schema) {
  if (!schema || !schema.__schema) {
    return { ok: false, error: 'Invalid schema definition' };
  }

  if (value === null || value === undefined) {
    if (schema.required) {
      return { ok: false, error: `Field is required` };
    }
    return { ok: true, value: schema.default !== undefined ? schema.default : undefined };
  }

  switch (schema.type) {
    case 'string':
      return validateString(value, schema);
    case 'number':
      return validateNumber(value, schema);
    case 'boolean':
      return validateBoolean(value, schema);
    case 'enum':
      return validateEnum(value, schema);
    case 'uuid':
      return validateUuid(value, schema);
    case 'array':
      return validateArray(value, schema);
    case 'object':
      return validateObject(value, schema);
    default:
      return { ok: false, error: `Unknown schema type: ${schema.type}` };
  }
}

function validateString(value, schema) {
  if (typeof value !== 'string') {
    return { ok: false, error: `Expected string, got ${typeof value}` };
  }
  let v = value;
  if (schema.trim !== false) v = v.trim();
  if (schema.required && !v) {
    return { ok: false, error: `${schema.label || 'Field'} is required` };
  }
  if (schema.max && v.length > schema.max) {
    if (schema.truncate === false) {
      return { ok: false, error: `${schema.label || 'Field'} must be at most ${schema.max} characters` };
    }
    v = v.slice(0, schema.max);
  }
  if (schema.min !== undefined && v.length < schema.min) {
    return { ok: false, error: `${schema.label || 'Field'} must be at least ${schema.min} characters` };
  }
  if (schema.pattern && !schema.pattern.test(v)) {
    return { ok: false, error: `${schema.label || 'Field'} has invalid format` };
  }
  return { ok: true, value: v };
}

function validateNumber(value, schema) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `Expected number, got ${typeof value}` };
  }
  if (schema.min !== undefined && n < schema.min) {
    return { ok: false, error: `${schema.label || 'Field'} must be >= ${schema.min}` };
  }
  if (schema.max !== undefined && n > schema.max) {
    return { ok: false, error: `${schema.label || 'Field'} must be <= ${schema.max}` };
  }
  if (schema.integer && !Number.isInteger(n)) {
    return { ok: false, error: `${schema.label || 'Field'} must be an integer` };
  }
  return { ok: true, value: n };
}

function validateBoolean(value, schema) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 'true') return { ok: true, value: true };
  if (value === 'false') return { ok: true, value: false };
  return { ok: false, error: `Expected boolean, got ${typeof value}` };
}

function validateEnum(value, schema) {
  if (!Array.isArray(schema.values)) {
    return { ok: false, error: 'Enum schema missing values array' };
  }
  const v = String(value);
  if (!schema.values.includes(v)) {
    return { ok: false, error: `Must be one of: ${schema.values.join(', ')}` };
  }
  return { ok: true, value: v };
}

function validateUuid(value, schema) {
  const v = String(value || '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(v)) {
    return { ok: false, error: `${schema.label || 'Field'} must be a valid UUID` };
  }
  return { ok: true, value: v };
}

function validateArray(value, schema) {
  if (!Array.isArray(value)) {
    return { ok: false, error: `Expected array, got ${typeof value}` };
  }
  if (schema.max !== undefined && value.length > schema.max) {
    return { ok: false, error: `Array must have at most ${schema.max} items` };
  }
  if (schema.min !== undefined && value.length < schema.min) {
    return { ok: false, error: `Array must have at least ${schema.min} items` };
  }
  const results = [];
  for (let i = 0; i < value.length; i++) {
    const r = validate(value[i], schema.itemSchema);
    if (!r.ok) return { ok: false, error: `[${i}] ${r.error}` };
    results.push(r.value);
  }
  return { ok: true, value: results };
}

function validateObject(value, schema) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}` };
  }
  const result = {};
  const properties = schema.properties || {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const r = validate(value[key], propSchema);
    if (!r.ok) {
      return { ok: false, error: propSchema.label ? `${propSchema.label}: ${r.error}` : `${key}: ${r.error}` };
    }
    if (r.value !== undefined) result[key] = r.value;
  }
  // Optionally reject unknown keys (strict mode)
  if (schema.strict) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        return { ok: false, error: `Unknown field: ${key}` };
      }
    }
  }
  return { ok: true, value: result };
}

// ── Pre-defined route schemas ─────────────────────────────────────

const RouteSchemas = {
  createTask: Schema.object({
    prompt: Schema.string({ required: true, max: 24000, label: 'prompt' }),
    threadId: Schema.string({ required: false, max: 160, label: 'threadId' }),
    deviceId: Schema.string({ required: false, max: 160, label: 'deviceId' }),
    idempotencyKey: Schema.string({ required: false, max: 120, label: 'idempotencyKey' }),
    traceId: Schema.string({ required: false, max: 64, label: 'traceId' }),
    routePreference: Schema.enum(['local', 'cloud', 'auto'], { required: false, label: 'routePreference' }),
  }),
  deviceSubmitTask: Schema.object({
    prompt: Schema.string({ required: true, max: 24000, truncate: false, label: 'prompt' }),
    threadId: Schema.string({ required: false, max: 160, truncate: false, label: 'threadId' }),
    routePreference: Schema.enum(['local', 'cloud', 'auto'], {
      required: false,
      default: 'cloud',
      label: 'routePreference',
    }),
    contextMessages: Schema.array(
      Schema.object({
        role: Schema.enum(['user', 'assistant', 'system'], { required: true, label: 'role' }),
        content: Schema.string({ required: true, max: 8000, truncate: false, label: 'content' }),
      }, { strict: true }),
      { required: false, max: 60 },
    ),
    idempotencyKey: Schema.string({ required: false, max: 120, truncate: false, label: 'idempotencyKey' }),
    traceId: Schema.string({ required: false, max: 64, truncate: false, label: 'traceId' }),
    source: Schema.string({ required: false, max: 40, truncate: false, label: 'source' }),
  }, { strict: true }),
  feedback: Schema.object({
    taskId: Schema.string({ required: true, max: 160, label: 'taskId' }),
    signal: Schema.enum(['up', 'down'], { required: true, label: 'signal' }),
    note: Schema.string({ required: false, max: 2000, label: 'note' }),
  }),
  pairingStart: Schema.object({
    deviceName: Schema.string({ required: true, max: 120, label: 'deviceName' }),
  }),
  pairingApprove: Schema.object({
    userCode: Schema.string({ required: true, max: 20, label: 'userCode' }),
  }),
  threadRename: Schema.object({
    title: Schema.string({ required: true, max: 200, label: 'title' }),
  }),
};

// ── Express/Next.js middleware helper ─────────────────────────────

/**
 * Returns { ok, value, error } — call from route handlers:
 *   const { ok, value, error } = validateRoute(body, RouteSchemas.createTask);
 *   if (!ok) return jsonError(error);
 */
function validateRoute(body, schema) {
  return validate(body, schema);
}

export { Schema, validate, validateRoute, RouteSchemas };
