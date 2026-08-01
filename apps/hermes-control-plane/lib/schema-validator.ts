/**
 * A+ Structured Outputs: runtime schema validation for API routes.
 *
 * Thin TypeScript wrapper around the Node-level `hermes-schema-validator.js`.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const validator = require("../../tools/hermes-schema-validator.js") as {
  validate: (value: unknown, schema: unknown) => {
    ok: boolean;
    value: unknown;
    error?: string;
  };
  RouteSchemas: Record<string, unknown>;
};

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  errors: string[];
}

/**
 * Validate a request body against a schema.
 * Usage: validateRoute(RouteSchemas.createTask, requestBody)
 */
export function validateRoute<T = unknown>(
  schema: unknown,
  input: unknown,
): ValidationResult<T> {
  // JS validate takes (value, schema) — swap order for ergonomic TS API
  const result = validator.validate(input, schema);
  return {
    ok: result.ok,
    value: result.ok ? (result.value as T) : null,
    errors: result.ok ? [] : [result.error || 'validation failed'],
  };
}

export const RouteSchemas = validator.RouteSchemas;
