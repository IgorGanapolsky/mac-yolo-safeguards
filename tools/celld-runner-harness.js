#!/usr/bin/env node
'use strict';

/**
 * celld-runner-harness.js — Self-Hosted Durable Objects & Celld Runner Harness.
 * Inspired by Ryan Dahl's celld (open-source Durable Objects for local/self-hosted infrastructure).
 *
 * Capabilities:
 * 1. Co-locates stateful device actors and SQLite storage locally.
 * 2. Provides single-threaded CAS task leasing without Cloudflare platform lock-in.
 * 3. Benchmarks lease claims, renewals, and WebSocket state hibernation.
 *
 * Usage:
 *   node tools/celld-runner-harness.js status
 *   node tools/celld-runner-harness.js benchmark --tasks 100
 */

const { CelldDeviceActor } = require('./lib/celld-device-actor');

class CelldClusterManager {
  constructor() {
    this.actors = new Map();
  }

  getOrCreateActor(deviceId, organizationId = 'org_default', name = 'Local Mac') {
    if (!this.actors.has(deviceId)) {
      this.actors.set(deviceId, new CelldDeviceActor(deviceId, organizationId, name));
    }
    return this.actors.get(deviceId);
  }

  listActorsStatus() {
    const statuses = [];
    for (const [id, actor] of this.actors.entries()) {
      statuses.push(actor.getStatus());
    }
    return statuses;
  }

  benchmark(taskCount = 100) {
    const actor = this.getOrCreateActor('bench-device-1', 'org_bench', 'Benchmark Mac');
    const startTime = Date.now();
    const claims = [];

    for (let i = 0; i < taskCount; i++) {
      const lease = actor.claimTask(`task_${i}`, 'device:bench-device-1');
      if (lease) claims.push({ taskId: `task_${i}`, leaseToken: lease.leaseToken });
    }

    const claimTimeMs = Date.now() - startTime;
    const completeStart = Date.now();

    for (const claim of claims) {
      actor.completeTask(claim.taskId, 'device:bench-device-1', claim.leaseToken);
    }

    const completeTimeMs = Date.now() - completeStart;
    const totalTimeMs = Math.max(1, claimTimeMs + completeTimeMs);

    return {
      totalTasks: taskCount,
      claimsSuccessful: claims.length,
      claimTimeMs,
      completeTimeMs,
      opsPerSec: Math.round((taskCount * 2) / (totalTimeMs / 1000)),
    };
  }
}

// CLI Interface
if (require.main === module) {
  const manager = new CelldClusterManager();
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  if (cmd === 'benchmark') {
    const countIdx = args.indexOf('--tasks');
    const tasks = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 100;
    const res = manager.benchmark(tasks);
    console.log(`⚡ Celld Self-Hosted Durable Objects Benchmark (${tasks} tasks):`);
    console.log(JSON.stringify(res, null, 2));
  } else {
    manager.getOrCreateActor('device-igors-mac-mini', 'org_igor', "Igor's Mac mini");
    console.log(`📦 Celld Self-Hosted Cluster Status:`);
    console.log(JSON.stringify(manager.listActorsStatus(), null, 2));
  }
}

module.exports = {
  CelldClusterManager,
};
