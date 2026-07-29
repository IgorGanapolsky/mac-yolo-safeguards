import { createHash } from "node:crypto";

import {
  finalizeEvent,
  getPublicKey,
  validateEvent,
  verifyEvent,
} from "nostr-tools/pure";

export const BUZZ_APPROVAL_REQUEST_KIND = 46010;
export const BUZZ_APPROVAL_GRANT_KIND = 46030;
export const BUZZ_APPROVAL_DENY_KIND = 46031;

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const DEFAULT_MAX_FUTURE_SKEW_SECONDS = 60;
const MAX_REQUEST_CONTENT_LENGTH = 4_096;
const MAX_DECISION_NOTE_LENGTH = 1_024;

export class BuzzApprovalProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BuzzApprovalProtocolError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BuzzApprovalProtocolError(code, message);
}

function unixSeconds(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("invalid_timestamp", `${fieldName} must be a non-negative Unix timestamp`);
  }
  return value;
}

function currentUnixSeconds(nowSeconds) {
  return unixSeconds(
    nowSeconds ?? Math.floor(Date.now() / 1_000),
    "nowSeconds",
  );
}

function lowerHex64(value, fieldName) {
  if (typeof value !== "string" || !HEX_64.test(value)) {
    fail("invalid_hex", `${fieldName} must be 64 lowercase hexadecimal characters`);
  }
  return value;
}

function normalizedText(value, fieldName, maximumLength, { required = false } = {}) {
  if (typeof value !== "string") {
    fail("invalid_text", `${fieldName} must be a string`);
  }
  const text = value.trim();
  if (required && text.length === 0) {
    fail("missing_context", `${fieldName} must explain the requested action`);
  }
  if (text.length > maximumLength) {
    fail("text_too_long", `${fieldName} exceeds ${maximumLength} characters`);
  }
  return text;
}

function tagValues(event, tagName) {
  return event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === tagName)
    .map((tag) => tag[1]);
}

function singleTag(event, tagName) {
  const values = tagValues(event, tagName);
  if (values.length === 0 || typeof values[0] !== "string") {
    fail("missing_tag", `Buzz approval event requires one ${tagName} tag`);
  }
  if (values.length !== 1) {
    fail("ambiguous_tag", `Buzz approval event requires exactly one ${tagName} tag`);
  }
  return values[0];
}

function canonicalNostrEvent(event) {
  if (
    !event ||
    typeof event !== "object" ||
    !HEX_64.test(event.id) ||
    !HEX_64.test(event.pubkey) ||
    !HEX_128.test(event.sig)
  ) {
    fail("invalid_event", "Buzz approval event is missing signed NIP-01 fields");
  }
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: Array.isArray(event.tags)
      ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
      : event.tags,
    content: event.content,
    sig: event.sig,
  };
}

function assertSignedEvent(event) {
  const candidate = canonicalNostrEvent(event);
  if (!validateEvent(candidate)) {
    fail("invalid_event", "Buzz approval event is not a valid NIP-01 event");
  }
  if (!verifyEvent(candidate)) {
    fail("invalid_signature", "Buzz approval event signature or id is invalid");
  }
  return candidate;
}

function assertRequestShape(request) {
  if (!request || typeof request !== "object") {
    fail("invalid_request", "A verified Buzz approval request is required");
  }
  const eventId = lowerHex64(request.eventId, "request.eventId");
  const tokenHash = lowerHex64(request.tokenHash, "request.tokenHash");
  const requesterPubkey = lowerHex64(
    request.requesterPubkey,
    "request.requesterPubkey",
  );
  const approverPubkey = lowerHex64(
    request.approverPubkey,
    "request.approverPubkey",
  );
  const createdAtSeconds = unixSeconds(
    request.createdAtSeconds,
    "request.createdAtSeconds",
  );
  const expiresAtSeconds = unixSeconds(
    request.expiresAtSeconds,
    "request.expiresAtSeconds",
  );
  if (expiresAtSeconds <= createdAtSeconds) {
    fail("invalid_expiry", "Buzz approval expiry must be after request creation");
  }
  return {
    eventId,
    tokenHash,
    requesterPubkey,
    approverPubkey,
    createdAtSeconds,
    expiresAtSeconds,
  };
}

export function hashBuzzApprovalToken(rawToken) {
  if (
    typeof rawToken !== "string" ||
    rawToken.length === 0 ||
    rawToken.length > 256
  ) {
    fail(
      "invalid_token",
      "Buzz approval token must be a non-empty string no longer than 256 characters",
    );
  }
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export class BuzzApprovalReplayGuard {
  #eventExpiries = new Map();

  constructor({ maxEntries = 10_000 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      fail("invalid_capacity", "Replay guard capacity must be a positive integer");
    }
    this.maxEntries = maxEntries;
  }

  consume(eventId, expiresAtSeconds, nowSeconds) {
    const now = currentUnixSeconds(nowSeconds);
    for (const [seenEventId, expiry] of this.#eventExpiries) {
      if (expiry <= now) {
        this.#eventExpiries.delete(seenEventId);
      }
    }
    if (this.#eventExpiries.has(eventId)) {
      fail("replayed_request", "Buzz approval request was already accepted");
    }
    if (this.#eventExpiries.size >= this.maxEntries) {
      fail(
        "replay_guard_capacity",
        "Buzz approval replay guard is full; fail closed until entries expire",
      );
    }
    this.#eventExpiries.set(eventId, expiresAtSeconds);
  }

  get size() {
    return this.#eventExpiries.size;
  }
}

export class BuzzApprovalDecisionGuard {
  #tokenExpiries = new Map();

  constructor({ maxEntries = 10_000 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      fail("invalid_capacity", "Decision guard capacity must be a positive integer");
    }
    this.maxEntries = maxEntries;
  }

  assertAvailable(tokenHash, nowSeconds) {
    const now = currentUnixSeconds(nowSeconds);
    for (const [seenTokenHash, expiry] of this.#tokenExpiries) {
      if (expiry <= now) {
        this.#tokenExpiries.delete(seenTokenHash);
      }
    }
    if (this.#tokenExpiries.has(tokenHash)) {
      fail("duplicate_decision", "Buzz approval request already has a local decision");
    }
    if (this.#tokenExpiries.size >= this.maxEntries) {
      fail(
        "decision_guard_capacity",
        "Buzz approval decision guard is full; fail closed until entries expire",
      );
    }
  }

  record(tokenHash, expiresAtSeconds) {
    this.#tokenExpiries.set(tokenHash, expiresAtSeconds);
  }

  get size() {
    return this.#tokenExpiries.size;
  }
}

export function parseBuzzApprovalRequest(
  event,
  {
    approverPubkey,
    nowSeconds,
    maxFutureSkewSeconds = DEFAULT_MAX_FUTURE_SKEW_SECONDS,
    replayGuard,
  } = {},
) {
  const now = currentUnixSeconds(nowSeconds);
  const expectedApprover = lowerHex64(approverPubkey, "approverPubkey");
  if (
    !Number.isSafeInteger(maxFutureSkewSeconds) ||
    maxFutureSkewSeconds < 0
  ) {
    fail("invalid_clock_skew", "maxFutureSkewSeconds must be a non-negative integer");
  }

  const signedEvent = assertSignedEvent(event);
  if (signedEvent.kind !== BUZZ_APPROVAL_REQUEST_KIND) {
    fail(
      "wrong_kind",
      `Expected Buzz approval request kind ${BUZZ_APPROVAL_REQUEST_KIND}`,
    );
  }
  if (signedEvent.created_at > now + maxFutureSkewSeconds) {
    fail("future_event", "Buzz approval request is too far in the future");
  }

  const tokenHash = lowerHex64(singleTag(signedEvent, "d"), "d tag");
  const designatedApprover = lowerHex64(singleTag(signedEvent, "p"), "p tag");
  if (designatedApprover !== expectedApprover) {
    fail(
      "wrong_approver",
      "Buzz approval request is designated for a different signer",
    );
  }

  const expirationText = singleTag(signedEvent, "expiration");
  if (!/^[0-9]+$/.test(expirationText)) {
    fail("invalid_expiry", "Buzz approval expiration tag must be Unix seconds");
  }
  const expiresAtSeconds = unixSeconds(
    Number(expirationText),
    "expiration tag",
  );
  if (expiresAtSeconds <= signedEvent.created_at) {
    fail("invalid_expiry", "Buzz approval expiry must be after request creation");
  }
  if (expiresAtSeconds <= now) {
    fail("expired_request", "Buzz approval request has expired");
  }

  const title = normalizedText(
    signedEvent.content,
    "event.content",
    MAX_REQUEST_CONTENT_LENGTH,
    { required: true },
  );
  const request = Object.freeze({
    eventId: lowerHex64(signedEvent.id, "event.id"),
    source: "relay_hook",
    tokenHash,
    requesterPubkey: lowerHex64(signedEvent.pubkey, "event.pubkey"),
    approverPubkey: designatedApprover,
    title,
    reason: title,
    allowPermanent: false,
    createdAtSeconds: signedEvent.created_at,
    expiresAtSeconds,
    receivedAt: new Date(signedEvent.created_at * 1_000).toISOString(),
  });

  if (replayGuard !== undefined) {
    if (!(replayGuard instanceof BuzzApprovalReplayGuard)) {
      fail("invalid_replay_guard", "replayGuard must be a BuzzApprovalReplayGuard");
    }
    replayGuard.consume(request.eventId, request.expiresAtSeconds, now);
  }

  return request;
}

export function buildBuzzApprovalDecision(
  request,
  {
    decision,
    secretKey,
    note = "",
    nowSeconds,
    decisionGuard,
  } = {},
) {
  const verifiedRequest = assertRequestShape(request);
  const now = currentUnixSeconds(nowSeconds);
  if (now >= verifiedRequest.expiresAtSeconds) {
    fail("expired_request", "Buzz approval request expired before the decision");
  }
  if (decision !== "approve" && decision !== "deny") {
    fail("invalid_decision", "Buzz approval decision must be approve or deny");
  }
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32) {
    fail("invalid_secret_key", "Buzz signer secret key must be 32 bytes");
  }
  const decisionNote = normalizedText(
    note,
    "note",
    MAX_DECISION_NOTE_LENGTH,
  );
  if (decisionGuard !== undefined) {
    if (!(decisionGuard instanceof BuzzApprovalDecisionGuard)) {
      fail(
        "invalid_decision_guard",
        "decisionGuard must be a BuzzApprovalDecisionGuard",
      );
    }
    decisionGuard.assertAvailable(verifiedRequest.tokenHash, now);
  }

  const signerPubkey = getPublicKey(secretKey);
  if (signerPubkey !== verifiedRequest.approverPubkey) {
    fail(
      "wrong_signer",
      "Buzz decision key does not match the request's designated approver",
    );
  }

  const event = finalizeEvent(
    {
      kind:
        decision === "approve"
          ? BUZZ_APPROVAL_GRANT_KIND
          : BUZZ_APPROVAL_DENY_KIND,
      created_at: now,
      tags: [
        ["d", verifiedRequest.tokenHash],
        ["e", verifiedRequest.eventId],
        ["p", verifiedRequest.requesterPubkey],
      ],
      content: decisionNote,
    },
    secretKey,
  );
  if (!verifyEvent(event)) {
    fail("signing_failed", "Generated Buzz approval decision did not verify");
  }

  decisionGuard?.record(
    verifiedRequest.tokenHash,
    verifiedRequest.expiresAtSeconds,
  );
  return event;
}

export function verifyBuzzApprovalDecision(
  event,
  request,
  {
    nowSeconds,
    maxFutureSkewSeconds = DEFAULT_MAX_FUTURE_SKEW_SECONDS,
  } = {},
) {
  const verifiedRequest = assertRequestShape(request);
  const now = currentUnixSeconds(nowSeconds);
  if (
    !Number.isSafeInteger(maxFutureSkewSeconds) ||
    maxFutureSkewSeconds < 0
  ) {
    fail("invalid_clock_skew", "maxFutureSkewSeconds must be a non-negative integer");
  }

  const signedEvent = assertSignedEvent(event);
  if (
    signedEvent.kind !== BUZZ_APPROVAL_GRANT_KIND &&
    signedEvent.kind !== BUZZ_APPROVAL_DENY_KIND
  ) {
    fail("wrong_kind", "Buzz decision must be a grant or deny event");
  }
  if (signedEvent.pubkey !== verifiedRequest.approverPubkey) {
    fail("wrong_signer", "Buzz decision was signed by a different approver");
  }
  if (signedEvent.created_at > now + maxFutureSkewSeconds) {
    fail("future_event", "Buzz approval decision is too far in the future");
  }
  if (signedEvent.created_at >= verifiedRequest.expiresAtSeconds) {
    fail("expired_request", "Buzz approval decision was created after expiry");
  }
  if (singleTag(signedEvent, "d") !== verifiedRequest.tokenHash) {
    fail("wrong_reference", "Buzz decision token hash does not match the request");
  }
  if (singleTag(signedEvent, "e") !== verifiedRequest.eventId) {
    fail("wrong_reference", "Buzz decision event reference does not match the request");
  }
  if (singleTag(signedEvent, "p") !== verifiedRequest.requesterPubkey) {
    fail("wrong_reference", "Buzz decision requester does not match the request");
  }
  const note = normalizedText(
    signedEvent.content,
    "event.content",
    MAX_DECISION_NOTE_LENGTH,
  );

  return Object.freeze({
    decision:
      signedEvent.kind === BUZZ_APPROVAL_GRANT_KIND ? "approve" : "deny",
    eventId: signedEvent.id,
    requestEventId: verifiedRequest.eventId,
    tokenHash: verifiedRequest.tokenHash,
    approverPubkey: signedEvent.pubkey,
    note,
    createdAtSeconds: signedEvent.created_at,
  });
}
