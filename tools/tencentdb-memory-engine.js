#!/usr/bin/env node
'use strict';
/**
 * TencentDB Agent Memory — local layered-memory engine.
 *
 * Implements the four GAP controls the readiness gate (`tencentdb-memory-readiness.js`)
 * checks, entirely locally, with zero cloud dependency:
 *
 *   1. short_term_refs  — offload verbose tool/browser/CLI output to `refs/` with a
 *                         stable `result_ref` id.
 *   2. mermaid_canvas   — a compact Mermaid `stateDiagram` task canvas that keeps the
 *                         active state machine visible without replaying every raw event.
 *   3. layered_ltm      — L0 conversation / L1 atoms / L2 scenarios / L3 persona files
 *                         (dirs: conversation/, atoms.jsonl, scenarios/, persona.md).
 *   4. traceable_recall — every recorded atom carries a `node_id` + `result_ref` back to
 *                         a raw local source.
 *
 * Layout (matches the readiness gate's constants):
 *   <root>/
 *     refs/         <- one file per offloaded tool log (result_ref = file name)
 *     atoms.jsonl   <- L1 traceable facts (node_id, result_ref, layer, text)
 *     conversation/ <- L0 raw conversation transcripts
 *     scenarios/    <- L2 recurring scenario files
 *     persona.md    <- L3 persona
 *     canvas.mmd    <- the compact Mermaid task canvas
 *
 * Usage:
 *   node tools/tencentdb-memory-engine.js init --root <dir>
 *   node tools/tencentdb-memory-engine.js offload --root <dir> --name <slug> [--stdin]
 *   node tools/tencentdb-memory-engine.js atom --root <dir> --layer L1 --text "<fact>" [--ref <name>]
 *   node tools/tencentdb-memory-engine.js scenario --root <dir> --slug <name> --text "<desc>"
 *   node tools/tencentdb-memory-engine.js canvas --root <dir> --state <id> --title <t>
 *   node tools/tencentdb-memory-engine.js status --root <dir> [--json]
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOT = path.join(os.homedir(), '.hermes/memory/tencentdb');
const NOW = () => new Date().toISOString();

function mermaidSafe(text) {
  return String(text).replace(/[()[\]:]/g, '').replace(/\s+/g, '_').slice(0, 40);
}

function makeNodeId(seed) {
  return crypto.createHash('sha256').update(`${NOW()}::${seed}`).digest('hex').slice(0, 16);
}

function ensureDirs(root) {
  for (const d of ['refs', 'conversation', 'scenarios']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
}

function readOrEmpty(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
}

function loadAtoms(root) {
  const file = path.join(root, 'atoms.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function appendAtom(root, atom) {
  const file = path.join(root, 'atoms.jsonl');
  fs.appendFileSync(file, `${JSON.stringify(atom)}\n`, 'utf8');
  return atom;
}

function writePersona(root, text) {
  fs.writeFileSync(path.join(root, 'persona.md'), `${text}\n`, 'utf8');
}

function writeCanvas(root, text) {
  fs.writeFileSync(path.join(root, 'canvas.mmd'), `${text}\n`, 'utf8');
}

function renderCanvas({ title, state }) {
  const t = mermaidSafe(title || 'Active_Task');
  const s = mermaidSafe(state || 'Ready');
  return [
    'stateDiagram-v2',
    `  [*] --> ${s}`,
    `  state "${t}" as ${t}`,
    `  ${s}: ${s}`,
  ].join('\n');
}

function cmdInit(root) {
  ensureDirs(root);
  const atomsFile = path.join(root, 'atoms.jsonl');
  if (!fs.existsSync(atomsFile)) fs.writeFileSync(atomsFile, '', 'utf8');
  if (!fs.existsSync(path.join(root, 'persona.md'))) {
    writePersona(root, '# Persona\nLocal Hermes mobile+platform agent persona. L3 long-term memory.');
  }
  if (!fs.existsSync(path.join(root, 'canvas.mmd'))) {
    writeCanvas(root, renderCanvas({ title: 'Active Task', state: 'Ready' }));
  }
  return { root, initialized: true };
}

function cmdOffload(root, name, payload) {
  if (!name) throw new Error('offload requires --name');
  const stamp = NOW().replace(/[-:.TZ]/g, '').slice(0, 14);
  const refName = `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}.md`;
  const file = path.join(root, 'refs', refName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, payload || '', 'utf8');
  const atom = {
    node_id: makeNodeId(`offload:${refName}`),
    layer: 'L1',
    kind: 'offload',
    result_ref: refName,
    text: `Offloaded tool output to refs/${refName}`,
    ts: NOW(),
  };
  appendAtom(root, atom);
  return atom;
}

function cmdAtom(root, { layer, text, ref, kind }) {
  if (!text) throw new Error('atom requires --text');
  const atom = {
    node_id: makeNodeId(`atom:${text}`),
    layer: String(layer || 'L2').toUpperCase().replace(/[^L0-4]/g, '') || 'L2',
    kind: kind || 'atom',
    result_ref: ref || null,
    text,
    ts: NOW(),
  };
  appendAtom(root, atom);
  return atom;
}

function cmdScenario(root, { slug, text }) {
  if (!slug || !text) throw new Error('scenario requires --slug and --text');
  const file = path.join(root, 'scenarios', `${String(slug).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`, 'utf8');
  const atom = {
    node_id: makeNodeId(`scenario:${slug}`),
    layer: 'L2',
    kind: 'scenario',
    result_ref: path.basename(file),
    text,
    ts: NOW(),
  };
  appendAtom(root, atom);
  return atom;
}

function cmdCanvas(root, { title, state }) {
  const text = renderCanvas({ title, state });
  writeCanvas(root, text);
  return {
    node_id: makeNodeId('canvas'),
    layer: 'L2',
    kind: 'canvas',
    result_ref: 'canvas.mmd',
    text: text.split('\n').slice(0, 3).join(' '),
    ts: NOW(),
  };
}

function cmdStatus(root, asJson) {
  const counts = {
    refs: (() => { try { return fs.readdirSync(path.join(root, 'refs')).length; } catch (_) { return 0; } })(),
    atoms: loadAtoms(root).length,
    scenarios: (() => { try { return fs.readdirSync(path.join(root, 'scenarios')).length; } catch (_) { return 0; } })(),
    conversation: (() => { try { return fs.readdirSync(path.join(root, 'conversation')).length; } catch (_) { return 0; } })(),
    persona: fs.existsSync(path.join(root, 'persona.md')),
    canvas: (() => {
      try {
        return fs.existsSync(path.join(root, 'canvas.mmd'))
          && /stateDiagram|graph\s+TD/.test(readOrEmpty(path.join(root, 'canvas.mmd')));
      } catch (_) { return false; }
    })(),
  };
  const out = { root, counts, layers: { L0: counts.conversation, L1: counts.atoms, L2: counts.scenarios, L3: counts.persona }, ts: NOW() };
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`root: ${root}`);
    console.log(`refs: ${counts.refs} | atoms: ${counts.atoms} | scenarios: ${counts.scenarios} | conversation: ${counts.conversation}`);
    console.log(`persona: ${counts.persona} | mermaid canvas: ${counts.canvas}`);
  }
  return counts;
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--layer') args.layer = argv[++i];
    else if (arg === '--text') args.text = argv[++i];
    else if (arg === '--ref') args.ref = argv[++i];
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--state') args.state = argv[++i];
    else if (arg === '--title') args.title = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--stdin') args.stdin = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown argument: ${arg}`);
    else args.cmd = arg;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/tencentdb-memory-engine.js <init|offload|atom|scenario|canvas|status> [--root <dir>] [--json]');
    return;
  }
  const root = path.resolve(args.root);
  const cmd = args.cmd;
  let result;
  switch (cmd) {
    case 'init': result = cmdInit(root); break;
    case 'offload': result = cmdOffload(root, args.name, args.stdin ? fs.readFileSync(0, 'utf8') : (args.text || '')); break;
    case 'atom': result = cmdAtom(root, args); break;
    case 'scenario': result = cmdScenario(root, args); break;
    case 'canvas': result = cmdCanvas(root, args); break;
    case 'status': return cmdStatus(root, args.json);
    default: throw new Error(`Unknown command: ${cmd || ''}`);
  }
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${cmd}: ${result.result_ref || result.node_id || 'ok'}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = {
  DEFAULT_ROOT, NOW, ensureDirs, renderCanvas, makeNodeId,
  init: cmdInit, offload: cmdOffload, atom: cmdAtom, scenario: cmdScenario,
  canvas: cmdCanvas, status: cmdStatus, parseArgs,
};
