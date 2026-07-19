const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const PROTOCOL_SCHEMA_VERSION = 1;
export const THREAD_EVENT_KINDS = Object.freeze([
  "user_message",
  "assistant_message",
  "thread_title_set",
  "thread_deleted",
]);

export class ProtocolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new ProtocolValidationError(message);
  }
}

export function validateId(value, fieldName) {
  requireCondition(typeof value === "string", `${fieldName} must be a string`);
  requireCondition(ID_PATTERN.test(value), `${fieldName} has an invalid format`);
  return value;
}

function validateJson(value, path = "payload") {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    requireCondition(Number.isFinite(value), `${path} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${path}[${index}]`));
    return;
  }
  requireCondition(
    typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype,
    `${path} must contain only JSON values`,
  );
  Object.entries(value).forEach(([key, entry]) => validateJson(entry, `${path}.${key}`));
}

function validateMessagePayload(payload) {
  validateId(payload.message_id, "payload.message_id");
  requireCondition(typeof payload.text === "string", "payload.text must be a string");
  requireCondition(payload.text.length <= 200_000, "payload.text is too large");
  if (payload.attachments !== undefined) {
    requireCondition(Array.isArray(payload.attachments), "payload.attachments must be an array");
    requireCondition(payload.attachments.length <= 20, "payload.attachments has too many entries");
  }
}

export function validatePayload(kind, payload) {
  requireCondition(
    payload !== null && typeof payload === "object" && !Array.isArray(payload),
    "payload must be an object",
  );
  validateJson(payload);
  switch (kind) {
    case "user_message":
    case "assistant_message":
      validateMessagePayload(payload);
      break;
    case "thread_title_set":
      requireCondition(
        typeof payload.title === "string" && payload.title.trim().length > 0,
        "payload.title must be a non-empty string",
      );
      requireCondition(payload.title.length <= 500, "payload.title is too large");
      break;
    case "thread_deleted":
      if (payload.reason !== undefined) {
        requireCondition(typeof payload.reason === "string", "payload.reason must be a string");
      }
      break;
    default:
      throw new ProtocolValidationError(`unsupported event kind: ${String(kind)}`);
  }
  return structuredClone(payload);
}

export function validateMutation(input) {
  requireCondition(input !== null && typeof input === "object", "mutation must be an object");
  const kind = input.kind;
  requireCondition(THREAD_EVENT_KINDS.includes(kind), `unsupported event kind: ${String(kind)}`);
  return {
    schema_version: PROTOCOL_SCHEMA_VERSION,
    account_id: validateId(input.account_id, "account_id"),
    thread_id: validateId(input.thread_id, "thread_id"),
    mutation_id: validateId(input.mutation_id, "mutation_id"),
    author_device_id: validateId(input.author_device_id, "author_device_id"),
    kind,
    payload: validatePayload(kind, input.payload),
  };
}

export function validateEvent(input) {
  const mutation = validateMutation(input);
  requireCondition(input.schema_version === PROTOCOL_SCHEMA_VERSION, "unsupported schema_version");
  requireCondition(Number.isSafeInteger(input.seq) && input.seq > 0, "seq must be a positive integer");
  requireCondition(
    typeof input.occurred_at === "string" && !Number.isNaN(Date.parse(input.occurred_at)),
    "occurred_at must be an ISO date",
  );
  return {
    ...mutation,
    event_id: validateId(input.event_id, "event_id"),
    seq: input.seq,
    occurred_at: input.occurred_at,
  };
}

export function mutationFingerprint(mutation) {
  const value = validateMutation(mutation);
  return JSON.stringify([
    value.schema_version,
    value.account_id,
    value.thread_id,
    value.mutation_id,
    value.author_device_id,
    value.kind,
    value.payload,
  ]);
}

export function projectThread(events) {
  requireCondition(Array.isArray(events), "events must be an array");
  const ordered = events.map(validateEvent).sort((left, right) => left.seq - right.seq);
  const seenEventIds = new Set();
  const messages = [];
  const gaps = [];
  let expectedSeq = 1;
  let title = null;
  let deleted = false;
  let lastSeq = 0;

  for (const event of ordered) {
    if (seenEventIds.has(event.event_id)) {
      continue;
    }
    seenEventIds.add(event.event_id);
    if (event.seq > expectedSeq) {
      gaps.push({ from_seq: expectedSeq, to_seq: event.seq - 1 });
    }
    expectedSeq = Math.max(expectedSeq, event.seq + 1);
    lastSeq = Math.max(lastSeq, event.seq);

    if (deleted) {
      continue;
    }
    if (event.kind === "thread_deleted") {
      deleted = true;
      messages.length = 0;
      continue;
    }
    if (event.kind === "thread_title_set") {
      title = event.payload.title;
      continue;
    }
    messages.push({
      message_id: event.payload.message_id,
      role: event.kind === "user_message" ? "user" : "assistant",
      text: event.payload.text,
      attachments: structuredClone(event.payload.attachments ?? []),
      seq: event.seq,
      occurred_at: event.occurred_at,
    });
  }

  return {
    schema_version: PROTOCOL_SCHEMA_VERSION,
    title,
    deleted,
    messages,
    gaps,
    last_seq: lastSeq,
  };
}
