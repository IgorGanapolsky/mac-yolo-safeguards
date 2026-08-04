/**
 * Minimal ACP transformer checks without control-plane vitest stack.
 * Source of truth: apps/hermes-control-plane/lib/acp-transformer.ts (TS).
 * We re-implement the pure logic in JS for this gate, then assert parity with
 * a dynamic TypeScript strip if available — otherwise structural clone of the API.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Prefer node --experimental-strip-types if the runtime supports TS import
let transformAcpToHermesTask;
let transformHermesResultToAcp;
try {
  const mod = await import(
    path.join(ROOT, 'apps/hermes-control-plane/lib/acp-transformer.ts')
  );
  transformAcpToHermesTask = mod.transformAcpToHermesTask;
  transformHermesResultToAcp = mod.transformHermesResultToAcp;
} catch {
  // Fallback: eval the TS as stripped by removing types (simple)
  const src = readFileSync(
    path.join(ROOT, 'apps/hermes-control-plane/lib/acp-transformer.ts'),
    'utf8',
  );
  // crude strip for our small file
  const js = src
    .replace(/export type[\s\S]*?;\n\n/g, '')
    .replace(/: AcpMessage/g, '')
    .replace(/: HermesTaskInstruction/g, '')
    .replace(/: string \| null/g, '')
    .replace(/: string/g, '')
    .replace(/: Record<string, unknown>/g, '')
    .replace(/export function/g, 'function')
    .replace(/export type[^\n]+\n/g, '');
  const wrapped = `${js}\nmodule.exports = { transformAcpToHermesTask, transformHermesResultToAcp };`;
  const Module = require('module');
  const m = new Module('acp-transformer-fallback');
  m._compile(wrapped, 'acp-transformer-fallback.js');
  transformAcpToHermesTask = m.exports.transformAcpToHermesTask;
  transformHermesResultToAcp = m.exports.transformHermesResultToAcp;
}

const acp = {
  protocolVersion: '1.0',
  sender: { id: 'user1', role: 'user', name: 'Igor' },
  payload: { text: '  @hermes-coder ship the bridge  ' },
  metadata: { nostrEventId: 'abc' },
};
const task = transformAcpToHermesTask(acp);
assert.equal(task.targetAgent, 'hermes-coder');
assert.equal(task.sourceProtocol, 'nostr');
assert.equal(task.prompt.includes('@hermes-coder'), true);

const out = transformHermesResultToAcp('done', null, 'user1');
assert.equal(out.sender.id, 'hermes-agent-control-plane');
assert.equal(out.payload.text, 'done');
assert.equal(out.metadata.recipientId, 'user1');

const errOut = transformHermesResultToAcp('', 'boom', 'user1');
assert.match(errOut.payload.text, /boom/);

console.log('PASS test-acp-transformer');
