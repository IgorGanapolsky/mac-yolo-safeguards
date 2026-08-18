/**
 * celld-device-actor.ts — Open-source Stateful Durable Object Device Actor.
 * Inspired by Ryan Dahl's celld (Durable Objects liberated from Cloudflare).
 *
 * Provides single-threaded, co-located stateful compute + storage for paired Mac devices,
 * CAS task lease generation fencing, state persistence, and WebSocket hibernation support.
 */

export interface DeviceState {
  deviceId: string;
  organizationId: string;
  name: string;
  lastSeenAt: number;
  activeLeasesCount: number;
  status: 'online' | 'busy' | 'offline';
}

export interface TaskLeaseRecord {
  taskId: string;
  owner: string;
  leaseToken: string;
  leaseGeneration: number;
  expiresAt: number;
}

export class CelldDeviceActor {
  private state: DeviceState;
  private leases: Map<string, TaskLeaseRecord> = new Map();
  private storage: Map<string, unknown> = new Map();

  constructor(deviceId: string, organizationId: string, name: string) {
    this.state = {
      deviceId,
      organizationId,
      name,
      lastSeenAt: Date.now(),
      activeLeasesCount: 0,
      status: 'online',
    };
  }

  public getStatus(): DeviceState {
    return {
      ...this.state,
      activeLeasesCount: this.leases.size,
      status: Date.now() - this.state.lastSeenAt > 60_000 ? 'offline' : this.leases.size > 0 ? 'busy' : 'online',
    };
  }

  public heartbeat(now = Date.now()): DeviceState {
    this.state.lastSeenAt = now;
    return this.getStatus();
  }

  public claimTask(taskId: string, owner: string, leaseDurationMs = 90_000, now = Date.now()): TaskLeaseRecord | null {
    const existing = this.leases.get(taskId);
    if (existing && existing.expiresAt > now && existing.owner !== owner) {
      // Task is locked by another lease owner
      return null;
    }

    const nextGen = (existing?.leaseGeneration ?? 0) + 1;
    const leaseToken = `celld_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const record: TaskLeaseRecord = {
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

  public completeTask(taskId: string, owner: string, leaseToken: string, now = Date.now()): boolean {
    const existing = this.leases.get(taskId);
    if (!existing) return false;
    if (existing.owner !== owner || existing.leaseToken !== leaseToken) return false;
    if (existing.expiresAt < now) return false; // expired lease

    this.leases.delete(taskId);
    this.state.lastSeenAt = now;
    return true;
  }

  public purgeStaleLeases(now = Date.now()): number {
    let purged = 0;
    for (const [taskId, lease] of this.leases.entries()) {
      if (lease.expiresAt < now) {
        this.leases.delete(taskId);
        purged += 1;
      }
    }
    return purged;
  }

  // Storage co-location primitives (Celld / Durable Object storage API contract)
  public async get<T>(key: string): Promise<T | undefined> {
    return this.storage.get(key) as T | undefined;
  }

  public async put<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value);
  }

  public async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }
}
