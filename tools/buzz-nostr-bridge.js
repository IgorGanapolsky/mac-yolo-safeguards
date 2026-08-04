#!/usr/bin/env node
'use strict';

/**
 * Buzz Nostr Bridge & Agent Identity Manager (@thumbgate/buzz-bridge)
 *
 * Real NIP-01 events and NIP-19 identifiers for Hermes/ThumbGate agents on Nostr.
 *
 * The previous implementation looked correct in a console and would have been
 * rejected by every relay, while its own suite passed 3/3:
 *   - pubkey was sha256(privkey). Nostr is secp256k1: pubkey = privkey*G, x-only
 *     (BIP-340). Unrelated values, so no relay could bind an event to its signer.
 *   - npub/nsec were `"npub1" + hex.slice(0,32)`: 16 bytes, no bech32, no checksum.
 *   - the signature was HMAC-SHA256. HMAC is symmetric, so verifying it needs the
 *     secret -- which defeats a public relay. NIP-01 requires BIP-340 Schnorr.
 *   - the demo derived a key from the literal seed "hermes-prod-seed" in a public
 *     repo and printed the resulting nsec to stdout.
 *
 * Imports use explicit `.js` subpaths: @noble/curves v2 (pinned ^2.2.0 in
 * package.json) declares subpath exports, and the bare specifier throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 */

const { schnorr } = require('@noble/curves/secp256k1.js');
const { sha256 } = require('@noble/hashes/sha2.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');
const { bech32 } = require('@scure/base');

// NIP-19 has no 90-char BIP-173 cap; raise the limit so 32-byte payloads encode.
const BECH32_LIMIT = 1000;

function encodeNip19(prefix, keyBytes) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length !== 32) {
    throw new Error(`${prefix}: expected 32 bytes, got ${keyBytes && keyBytes.length}`);
  }
  return bech32.encode(prefix, bech32.toWords(keyBytes), BECH32_LIMIT);
}

function decodeNip19(expectedPrefix, encoded) {
  const { prefix, words } = bech32.decode(encoded, BECH32_LIMIT);
  if (prefix !== expectedPrefix) throw new Error(`expected ${expectedPrefix}, got ${prefix}`);
  const bytes = Uint8Array.from(bech32.fromWords(words));
  if (bytes.length !== 32) throw new Error(`${expectedPrefix}: expected 32 bytes, got ${bytes.length}`);
  return bytes;
}

const npubToHex = (npub) => bytesToHex(decodeNip19('npub', npub));
const nsecToHex = (nsec) => bytesToHex(decodeNip19('nsec', nsec));

/**
 * Build an agent identity backed by a real secp256k1 keypair.
 *
 * Seed-derived keys are DETERMINISTIC and therefore public in a public repo --
 * that is exactly how "hermes-prod-seed" became a published private key. They now
 * require an explicit allowInsecureSeed flag so a fixture key cannot reach a relay
 * by accident.
 *
 * `nsec` and `hexPrivateKey` are non-enumerable: readable by name, but absent from
 * JSON.stringify, console.log and Object.keys, so secrets cannot ride along inside
 * a structured log line.
 */
function generateNostrAgentIdentity(options = {}) {
  const opts = typeof options === 'string'
    ? { seed: options, allowInsecureSeed: true }
    : (options || {});

  let secretKey;
  if (opts.privateKey) {
    secretKey = typeof opts.privateKey === 'string' ? hexToBytes(opts.privateKey) : opts.privateKey;
  } else if (opts.seed !== undefined && opts.seed !== null) {
    if (!opts.allowInsecureSeed) {
      throw new Error(
        'generateNostrAgentIdentity: seed-derived keys are deterministic and therefore public. '
        + 'Pass allowInsecureSeed: true to acknowledge this is a test fixture, never a relay identity.',
      );
    }
    secretKey = sha256(utf8ToBytes(String(opts.seed)));
  } else {
    secretKey = schnorr.keygen().secretKey;
  }
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32) {
    throw new Error('private key must be 32 bytes');
  }

  // BIP-340 x-only public key. Throws on an out-of-range scalar, so an unusable
  // key fails here rather than silently at the relay.
  const publicKey = schnorr.getPublicKey(secretKey);

  const identity = {
    npub: encodeNip19('npub', publicKey),
    hexPublicKey: bytesToHex(publicKey),
    agentName: opts.agentName || 'hermes-agent',
    capabilities: opts.capabilities || ['acp-code-execution', 'fenced-safety-lease', 'mac-freeze-guard'],
  };

  Object.defineProperty(identity, 'privateKeyBytes', { value: secretKey, enumerable: false });
  Object.defineProperty(identity, 'hexPrivateKey', {
    get: () => bytesToHex(secretKey),
    enumerable: false,
  });
  Object.defineProperty(identity, 'nsec', {
    get: () => encodeNip19('nsec', secretKey),
    enumerable: false,
  });
  Object.defineProperty(identity, 'exportNsec', {
    value: () => encodeNip19('nsec', secretKey),
    enumerable: false,
  });

  return identity;
}

/**
 * NIP-01 event id: sha256 over the UTF-8 JSON serialization of
 * [0, pubkey, created_at, kind, tags, content], no insignificant whitespace.
 */
function computeEventId(event) {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]))));
}

/** Create a NIP-01 event signed with BIP-340 Schnorr over its id. */
function createNostrAgentEvent({ identity, content, kind = 1, tags = [], createdAt }) {
  if (!identity || !identity.privateKeyBytes) {
    throw new Error('createNostrAgentEvent: identity with privateKeyBytes is required');
  }
  const unsigned = {
    pubkey: identity.hexPublicKey,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
  };
  const id = computeEventId(unsigned);
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), identity.privateKeyBytes));
  return { id, ...unsigned, sig };
}

/**
 * Verify like a relay: recompute the id from the body, then check the Schnorr
 * signature against the event's own pubkey. Returns { valid, error } so callers
 * get the reason rather than a bare false.
 */
function verifyNostrEvent(event) {
  if (!event || typeof event !== 'object') return { valid: false, error: 'not an event object' };
  for (const field of ['id', 'sig', 'pubkey', 'content']) {
    if (typeof event[field] !== 'string') return { valid: false, error: `missing/invalid ${field}` };
  }
  let recomputed;
  try {
    recomputed = computeEventId(event);
  } catch (error) {
    return { valid: false, error: `id computation failed: ${error.message}` };
  }
  if (recomputed !== event.id) return { valid: false, error: 'event id does not match body (tampered)' };
  try {
    const ok = schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
    return ok ? { valid: true } : { valid: false, error: 'schnorr signature verification failed' };
  } catch (error) {
    return { valid: false, error: `signature malformed: ${error.message}` };
  }
}

/** Parse an incoming Buzz event; `verified` reflects real signature verification. */
function parseBuzzNostrEvent(event) {
  if (!event || typeof event.content !== 'string') {
    return { valid: false, verified: false, error: 'Invalid Nostr event' };
  }
  const content = event.content.trim();
  const mentionMatch = content.match(/@(hermes(?:-[a-z0-9-]+)?)/i);
  return {
    valid: true,
    verified: verifyNostrEvent(event).valid,
    eventId: event.id,
    pubkey: event.pubkey,
    targetAgent: mentionMatch ? mentionMatch[1].toLowerCase() : 'hermes',
    prompt: content,
    isBuzzWorkspaceMention: Boolean(mentionMatch),
  };
}

/** Map a Nostr event onto an ACP message envelope. */
function nostrEventToAcpMessage(event) {
  return {
    protocolVersion: '1.0',
    sender: { id: event.pubkey, kind: 'nostr-pubkey' },
    payload: { text: event.content, contentType: 'text/plain' },
    metadata: {
      nostrEventId: event.id,
      nostrKind: event.kind,
      nostrCreatedAt: event.created_at,
      nostrTags: event.tags,
    },
  };
}

module.exports = {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  verifyNostrEvent,
  parseBuzzNostrEvent,
  nostrEventToAcpMessage,
  computeEventId,
  encodeNip19,
  decodeNip19,
  npubToHex,
  nsecToHex,
};

// Demo uses an ephemeral random key and never prints secret material.
if (require.main === module) {
  const identity = generateNostrAgentIdentity();
  const event = createNostrAgentEvent({
    identity,
    content: '@hermes-coder refactor authentication handler under fenced safety lease',
    tags: [['t', 'buzz-agent'], ['p', identity.hexPublicKey]],
  });
  console.log('npub:    ', identity.npub);
  console.log('event id:', event.id);
  console.log('verifies:', verifyNostrEvent(event).valid);
}
