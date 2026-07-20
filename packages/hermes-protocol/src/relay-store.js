import { randomUUID } from "node:crypto";
import {
  PROTOCOL_SCHEMA_VERSION,
  ProtocolValidationError,
  mutationFingerprint,
  projectThread,
  validateEvent,
  validateId,
  validateMutation,
} from "./protocol.js";

export class MutationConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "MutationConflictError";
  }
}

export class ThreadDeletedError extends Error {
  constructor(message) {
    super(message);
    this.name = "ThreadDeletedError";
  }
}

function threadKey(accountId, threadId) {
  return `${accountId}\u0000${threadId}`;
}

function mutationKey(accountId, mutationId) {
  return `${accountId}\u0000${mutationId}`;
}

export class RelayStore {
  #threads = new Map();
  #mutations = new Map();
  #clock;
  #eventIdFactory;

  constructor({ clock = () => new Date().toISOString(), eventIdFactory = () => `evt_${randomUUID()}` } = {}) {
    this.#clock = clock;
    this.#eventIdFactory = eventIdFactory;
  }

  append(input) {
    const mutation = validateMutation(input);
    const fingerprint = mutationFingerprint(mutation);
    const existing = this.#mutations.get(mutationKey(mutation.account_id, mutation.mutation_id));
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new MutationConflictError("mutation_id was already used with different content");
      }
      return { created: false, event: structuredClone(existing.event) };
    }

    const key = threadKey(mutation.account_id, mutation.thread_id);
    const events = this.#threads.get(key) ?? [];
    if (events.length > 0 && projectThread(events).deleted) {
      throw new ThreadDeletedError("thread is deleted");
    }
    const event = validateEvent({
      ...mutation,
      event_id: this.#eventIdFactory(),
      seq: events.length + 1,
      occurred_at: this.#clock(),
    });
    events.push(event);
    this.#threads.set(key, events);
    this.#mutations.set(mutationKey(mutation.account_id, mutation.mutation_id), {
      event,
      fingerprint,
    });
    return { created: true, event: structuredClone(event) };
  }

  listEvents(accountId, threadId, { afterSeq = 0 } = {}) {
    validateId(accountId, "account_id");
    validateId(threadId, "thread_id");
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) {
      throw new ProtocolValidationError("afterSeq must be a non-negative integer");
    }
    return (this.#threads.get(threadKey(accountId, threadId)) ?? [])
      .filter((event) => event.seq > afterSeq)
      .map((event) => structuredClone(event));
  }

  getThread(accountId, threadId) {
    return projectThread(this.listEvents(accountId, threadId));
  }

  listThreads(accountId, { includeDeleted = false } = {}) {
    validateId(accountId, "account_id");
    if (typeof includeDeleted !== "boolean") {
      throw new ProtocolValidationError("includeDeleted must be a boolean");
    }
    const prefix = `${accountId}\u0000`;
    const threads = [];
    for (const [key, events] of this.#threads.entries()) {
      if (!key.startsWith(prefix)) continue;
      const thread = projectThread(events);
      if (thread.deleted && !includeDeleted) continue;
      const lastEvent = events.at(-1);
      const lastMessage = thread.messages.at(-1);
      threads.push({
        thread_id: key.slice(prefix.length),
        title: thread.title,
        deleted: thread.deleted,
        last_seq: thread.last_seq,
        updated_at: lastEvent?.occurred_at ?? null,
        message_count: thread.messages.length,
        last_message_preview: lastMessage?.text.slice(0, 160) ?? null,
      });
    }
    return threads
      .sort((left, right) => {
        const timeOrder = String(right.updated_at).localeCompare(String(left.updated_at));
        return timeOrder || left.thread_id.localeCompare(right.thread_id);
      })
      .map((thread) => structuredClone(thread));
  }

  exportState() {
    return {
      schema_version: PROTOCOL_SCHEMA_VERSION,
      threads: [...this.#threads.values()].map((events) => events.map((event) => structuredClone(event))),
    };
  }

  static fromState(state, options = {}) {
    if (state === null || typeof state !== "object" || state.schema_version !== PROTOCOL_SCHEMA_VERSION) {
      throw new ProtocolValidationError("invalid relay state schema");
    }
    if (!Array.isArray(state.threads)) {
      throw new ProtocolValidationError("relay state threads must be an array");
    }
    const store = new RelayStore(options);
    for (const rawEvents of state.threads) {
      if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
        throw new ProtocolValidationError("relay state thread must contain events");
      }
      const events = rawEvents.map(validateEvent).sort((left, right) => left.seq - right.seq);
      const first = events[0];
      events.forEach((event, index) => {
        if (
          event.account_id !== first.account_id ||
          event.thread_id !== first.thread_id ||
          event.seq !== index + 1
        ) {
          throw new ProtocolValidationError("relay state thread is not a contiguous single thread");
        }
        const key = mutationKey(event.account_id, event.mutation_id);
        if (store.#mutations.has(key)) {
          throw new ProtocolValidationError("relay state contains duplicate mutation_id");
        }
        store.#mutations.set(key, {
          event,
          fingerprint: mutationFingerprint(event),
        });
      });
      store.#threads.set(threadKey(first.account_id, first.thread_id), events);
    }
    return store;
  }
}
