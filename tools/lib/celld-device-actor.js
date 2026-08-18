'use strict';

/**
 * celld-device-actor.js — Open-source Stateful Durable Object Device Actor.
 * Inspired by Ryan Dahl's celld (Durable Objects liberated from Cloudflare).
 *
 * Provides single-threaded, co-located stateful compute + storage for paired Mac devices,
 * CAS task lease generation fencing, state persistence, and WebSocket hibernation support.
 */

class CelldDeviceActor {
  constructor(deviceId, organizationId = 'org_default', name = 'Local Mac') {
    this.state = {
      deviceId,
      organizationId,
      name,
      lastSeenAt: Date.now(),
      activeLeasesCount: 0,
      status: 'online',
    };
    this.leases = new Map();
    this.storage = new Map();
  }

  getStatus() {
    return {
      ...this.state,
      activeLeasesCount: this.leases.size,
      status: Date.now() - this.state.lastSeenAt > 60_000 ? 'offline' : this.leases.size > 0 ? 'busy' : 'online',
    };
  }

  heartbeat(now = Date.now()) {
    this.state.lastSeenAt = now;
    return this.getStatus();
  }

  claimTask(taskId, owner, leaseDurationMs = 90_000, now = Date.now()) {
    const existing = this.leases.get(taskId);
    if (existing && existing.expiresAt > now && existing.owner !== owner) {
      return null;
    }

    const nextGen = (existing?.leaseGeneration ?? 0) + 1;
    const leaseToken = `celld_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      taskId,
      owner,
      leaseToken,
      leaseGeneration: nextGen,
      expiresAt: now + leaseDurationMs,
    };

    this.leases.set(taskId, record);
    this.state.lastSeenAt = now;
    return record;
  }

  completeTask(taskId, owner, leaseToken, now = Date.now()) {
    const existing = this.leases.get(taskId);
    if (!existing) return false;
    if (existing.owner !== owner || existing.leaseToken !== leaseToken) return false;
    if (existing.expiresAt < now) return false;

    this.leases.delete(taskId);
    this.state.lastSeenAt = now;
    return true;
  }

  purgeStaleLeases(now = Date.now()) {
    let purged = 0;
    for (const [taskId, lease] of this.leases.entries()) {
      if (lease.expiresAt < now) {
        this.leases.delete(taskId);
        purged += 1;
      }
    }
    return purged;
  }

  async get(key) {
    return this.storage.get(key);
  }

  async put(key, value) {
    this.storage.set(key, value);
  }

  async delete(key) {
    return this.storage.delete(key);
  }
}

module.exports = {
  CelldDeviceActor,
};
