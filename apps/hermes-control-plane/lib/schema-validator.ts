/**
 * A+ Structured Outputs: runtime schema validation for API routes.
 */

import {
  validate as validateValue,
  RouteSchemas as routeSchemas,
} from "./hermes-schema-validator.js";

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  errors: string[];
}

export function validateRoute<T = unknown>(
  schema: unknown,
  input: unknown,
): ValidationResult<T> {
  const result = validateValue(input, schema) as {
    ok: boolean;
    value?: unknown;
    error?: string;
  };
  return {
    ok: result.ok,
    value: result.ok ? (result.value as T) : null,
    errors: result.ok ? [] : [result.error || "validation failed"],
  };
}

export const RouteSchemas = routeSchemas as Record<string, unknown>;
