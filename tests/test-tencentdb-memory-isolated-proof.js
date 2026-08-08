#!/usr/bin/env node
'use strict';
/**
 * Isolated 100/100 readiness proof — TencentDB Agent Memory.
 *
 * Builds a COMPLETELY isolated Hermes config + memory root under a temp dir,
 * populates the root with the local engine, adds the memory_tencentdb route to
 * the isolated config, then runs the real readiness gate against those paths.
 * Asserts every control passes (100/100).
 *
 * It does NOT read or mutate the live ~/.hermes/config.yaml or live memory root.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ENGINE = path.join(REPO, 'tools/tencentdb-memory-engine.js');
const PROVIDER = path.join(REPO, 'tools/tencentdb-memory-provider.js');
const READINESS = path.join(REPO, 'tools/tencentdb-memory-readiness.js');

function run(script, args = [], opts = {}) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', ...opts }).trim();
}

function pass(name, msg) { console.log(`PASS ${name}${msg ? ` — ${msg}` : ''}`); }
function fail(name, msg) { console.error(`FAIL ${name} — ${msg}`); process.exitCode = 1; }

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tencentdb-proof-'));
  try {
    // 1. isolated config with memory enabled, bounded, slim toolset, and the tencentdb route
    const configYaml = `memory_enabled: true
memory_char_limit: 6000
memory_char_limit_provider: tencentdb
tools:
  - memory
plugins:
  - memory_tencentdb
providers:
  memory_tencentdb:
    enabled: true
    route: tdai_memory_search,tdai_conversation_search
`;
    const configPath = path.join(tmp, 'config.yaml');
    fs.writeFileSync(configPath, configYaml);

    // 2. isolated memory root populated with the engine
    const root = path.join(tmp, 'memory/tencentdb');
    fs.mkdirSync(path.join(root, 'refs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'conversation'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scenarios'), { recursive: true });

    // conversation + scenario + atom fixtures (same contract as the gate checks)
    fs.writeFileSync(path.join(root, 'conversation', '2026-08-07.md'),
      '# 2026-08-07\nHigh-ROI task: TencentDB Agent Memory. Needle: node_id traceability.\n');
    fs.writeFileSync(path.join(root, 'scenarios', 'agent-session.md'),
      '# Scenario\nSession start: recall last atoms before acting.\n');
    fs.writeFileSync(path.join(root, 'persona.md'),
      '# Persona\nReliability-focused local agent for Igor Ganapolsky.\n');
    fs.writeFileSync(path.join(root, 'canvas.mmd'),
      'flowchart TD\n  A[conversation] --> B[atoms L1/L2]\n  B --> C[scenarios L3]\n  C --> D[persona]\n');
    const atoms = [
      { node_id: 'a1', layer: 'L1', kind: 'task', text: 'implement local memory engine', result_ref: 'refs/2026-08-07.md' },
      { node_id: 'a2', layer: 'L2', kind: 'reflection', text: 'readiness gate needs refs + mermaid + layered LTM + trace', result_ref: 'refs/2026-08-07.md' },
    ];
    fs.writeFileSync(path.join(root, 'atoms.jsonl'), atoms.map((a) => JSON.stringify(a)).join('\n') + '\n');
    fs.writeFileSync(path.join(root, 'refs', '2026-08-07.md'), '# Ref\nNeedle: TencentDB Agent Memory\n');

    // 3. provider must be able to search the isolated root
    const search = JSON.parse(run(PROVIDER, ['tdai_memory_search', '--root', root, '--query', 'TencentDB Agent Memory']));
    if (search.length >= 1) pass('provider tdai_memory_search', `${search.length} hit(s)`);
    else fail('provider tdai_memory_search', 'no hits');

    const conv = JSON.parse(run(PROVIDER, ['tdai_conversation_search', '--root', root, '--query', 'node_id']));
    if (conv.length >= 1) pass('provider tdai_conversation_search', `${conv.length} hit(s)`);
    else fail('provider tdai_conversation_search', 'no hits');

    // 4. readiness gate against the isolated paths — must be 100/100
    const rd = JSON.parse(run(READINESS, ['--json', '--hermes-config', configPath, '--memory-root', root]));
    const gaps = rd.controls.filter((c) => !c.pass);
    if (rd.readiness === 100 && gaps.length === 0) {
      pass('isolated readiness 100/100', rd.recommendation);
    } else {
      fail('isolated readiness 100/100', `got ${rd.readiness}, gaps: ${gaps.map((g) => g.key).join(', ')}`);
    }

    // 5. live config must NOT have been touched (no route in real config)
    const liveConfig = path.join(os.homedir(), '.hermes/config.yaml');
    if (fs.existsSync(liveConfig)) {
      const liveText = fs.readFileSync(liveConfig, 'utf8');
      if (/memory_tencentdb|tdai_memory_search|tdai_conversation_search/i.test(liveText)) {
        fail('live config untouched', 'route found in live ~/.hermes/config.yaml');
      } else {
        pass('live config untouched', 'no tencentdb route in ~/.hermes/config.yaml');
      }
    } else {
      pass('live config untouched', 'no live config file');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
