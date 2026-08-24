/**
 * thumbgate.app re-export of the hosted browser ref-batch executor.
 *
 * Anthropic Browser Use does not run a browser (The New Stack, 2026-08-21).
 * Complementary to PR #2037. Do not import browser-guard from here.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const {
  SCHEMA,
  COUNSEL_CLEARANCE,
  HOSTED_PRICE_USD,
  DEFAULT_OPS,
  CONFIRM_OPS,
  honesty,
  createExecutor,
  main,
} = require('../../../tools/hosted-browser-ref-batch.js');
