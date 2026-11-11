#!/usr/bin/env node
'use strict';

/**
 * tests/test-agentic-graphrag-safeguard.js
 *
 * Unit tests verifying Agentic GraphRAG Safeguard invariants:
 * - Hub Graph construction with entities and relations
 * - Reserved Port Protection (Dayglass port 3333, Chrome CDP 9111)
 * - System Daemon Protection (mediaanalysisd, WindowServer, mds_stores)
 * - Live Agent Session Protection (Claude, OMP, Poolside, Gemini)
 * - Multi-hop agent child dependency protection
 * - Permitting safe termination of non-protected runaway processes
 */

const assert = require('assert');
const {
  PROTECTED_SYSTEM_DAEMONS,
  RESERVED_PORTS,
  buildHubGraphSnapshot,
  verifyActionAgainstGround,
} = require('../tools/agentic-graphrag-safeguard');

let passed = 0;
let total = 0;

function it(name, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Invariants Definitions
it('registers protected system daemons and reserved ports in Common Factual Ground', () => {
  assert(PROTECTED_SYSTEM_DAEMONS.has('mediaanalysisd'));
  assert(PROTECTED_SYSTEM_DAEMONS.has('WindowServer'));
  assert(PROTECTED_SYSTEM_DAEMONS.has('mds_stores'));

  assert(RESERVED_PORTS[3333]);
  assert.strictEqual(RESERVED_PORTS[3333].owner, 'Dayglass Server');
  assert(RESERVED_PORTS[9111]);
  assert.strictEqual(RESERVED_PORTS[9111].owner, 'Chrome CDP Debugger');
});

// 2. Reserved Port Verification
it('blocks killing or stealing Dayglass port 3333', () => {
  const res = verifyActionAgainstGround('kill', 'port 3333');
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.decision, 'BLOCK');
  assert(res.reason.includes('Dayglass Server'));
  assert.strictEqual(res.provenance, 'HubGraph:ReservedPorts');
});

it('blocks killing or modifying Chrome CDP port 9111', () => {
  const res = verifyActionAgainstGround('stop', '9111');
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.decision, 'BLOCK');
  assert(res.reason.includes('Chrome CDP'));
});

// 3. System Daemon Protection (e.g. mediaanalysisd from user screenshot)
it('blocks killing macOS system daemon mediaanalysisd with explicit provenance', () => {
  const mockGraph = {
    nodes: [
      {
        id: 'pid:22157',
        type: 'Process',
        pid: 22157,
        ppid: 1,
        name: 'mediaanalysisd',
        fullPath: '/System/Library/PrivateFrameworks/MediaAnalysis.framework/Versions/A/mediaanalysisd',
        isSystemDaemon: true,
        isLiveAgent: false,
      },
    ],
    edges: [],
  };

  const res = verifyActionAgainstGround('kill', '22157', mockGraph);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.decision, 'BLOCK');
  assert(res.reason.includes('protected macOS system daemon'));
  assert.strictEqual(res.provenance, 'ExpertSubgraph:SystemDaemons');
});

// 4. Live Agent Session Protection
it('blocks killing live agent session processes (AGENTS.md Rule 5)', () => {
  const mockGraph = {
    nodes: [
      {
        id: 'pid:77001',
        type: 'Process',
        pid: 77001,
        ppid: 1,
        name: 'claude',
        fullPath: '/Users/iganapolsky/.local/bin/claude',
        isSystemDaemon: false,
        isLiveAgent: true,
      },
    ],
    edges: [],
  };

  const res = verifyActionAgainstGround('kill', '77001', mockGraph);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.decision, 'BLOCK');
  assert(res.reason.includes('live AI agent session'));
  assert.strictEqual(res.provenance, 'ExpertSubgraph:LiveAgentSafety');
});

// 5. Multi-Hop Dependency Protection
it('blocks killing a worker tool spawned by a live agent within 3 hops', () => {
  const mockGraph = {
    nodes: [
      {
        id: 'pid:100',
        type: 'Process',
        pid: 100,
        ppid: 1,
        name: 'claude',
        fullPath: 'claude',
        isSystemDaemon: false,
        isLiveAgent: true,
      },
      {
        id: 'pid:200',
        type: 'Process',
        pid: 200,
        ppid: 100,
        name: 'node',
        fullPath: 'node /bin/bash',
        isSystemDaemon: false,
        isLiveAgent: false,
      },
      {
        id: 'pid:300',
        type: 'Process',
        pid: 300,
        ppid: 200,
        name: 'test-runner',
        fullPath: 'npm test',
        isSystemDaemon: false,
        isLiveAgent: false,
      },
    ],
    edges: [],
  };

  const res = verifyActionAgainstGround('kill', '300', mockGraph);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.decision, 'BLOCK');
  assert(res.reason.includes("spawned by live agent 'claude'"));
  assert.strictEqual(res.provenance, 'MultiHopGraphTrace:AgentDependency');
});

// 6. Allowing Safe Non-Protected Actions
it('allows terminating verified non-protected runaway processes', () => {
  const mockGraph = {
    nodes: [
      {
        id: 'pid:99999',
        type: 'Process',
        pid: 99999,
        ppid: 1,
        name: 'abandoned-script.sh',
        fullPath: '/tmp/abandoned-script.sh',
        isSystemDaemon: false,
        isLiveAgent: false,
      },
    ],
    edges: [],
  };

  const res = verifyActionAgainstGround('kill', '99999', mockGraph);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.decision, 'ALLOW');
  assert.strictEqual(res.provenance, 'GraphRAG:VerifiedGround');
});

console.log(`test-agentic-graphrag-safeguard: PASS (${passed}/${total} tests passed)`);
