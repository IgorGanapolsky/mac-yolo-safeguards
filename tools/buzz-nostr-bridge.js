#!/usr/bin/env node
'use strict';

/**
 * Buzz Nostr Bridge & Agent Identity Manager (@thumbgate/buzz-bridge)
 *
 * Bridges Hermes/ThumbGate agents onto Nostr relays using real NIP-01 events and
 * NIP-19 bech32 identifiers.
 *
 * The previous implementation produced output that looked correct in a console and
 * would have been rejected by every relay:
 *   - public key was sha256(privateKey); Nostr is secp256k1, pubkey = privkey*G
 *     (BIP-340 x-only). The two values are unrelated, so no relay could ever
 *     associate an event with its signer.
 *   - npub/nsec were `"npub1" + hex.slice(0, 32)` — 16 bytes of hex, no bech32, no
 *     checksum. No NIP-19 client can parse that.
 *   - the signature was HMAC-SHA256 under the private key. HMAC is symmetric, so
 *     verifying it requires the secret — which defeats a public relay entirely.
 *     NIP-01 requires a BIP-340 Schnorr signature over the event id.
 *   - the demo derived a key from the literal seed "hermes-prod-seed" in a public
 *     repo, and printed the resulting nsec to stdout.
 *
 * Crypto comes from audited libraries already vendored here:
 *   @noble/curves/secp256k1.js  BIP-340 Schnorr
 *   @noble/hashes              sha256, hex/utf8 helpers
 *   @scure/base                bech32 (the implementation nostr-tools wraps)
 */

const { schnorr } = require('@noble/curves/secp256k1.js');
const { sha256 } = require('@noble/hashes/sha2.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');
const { bech32 } = require('@scure/base');

// NIP-19 identifiers are bech32 (not bech32m) over the raw 32-byte key. The default
// bech32 length limit of 90 is a BIP-173 convention; NIP-19 has no such cap.
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

/**
 * Build a Nostr agent identity backed by a real secp256k1 keypair.
 *
 * The secret is deliberately NON-ENUMERABLE: it does not appear in JSON.stringify,
 * console.log, Object.keys, or structured logs. Callers that genuinely need it must
 * ask by name via exportNsec() / privateKeyBytes. That is what stops the old
 * "print the nsec at startup" leak from recurring.
 *
 * @param {string|object} [options] - legacy string seed, or { seed, privateKey, agentName, capabilities }
 */
function generateNostrAgentIdentity(options = {}) {
  const opts = typeof options === 'string' ? { seed: options } : (options || {});

  let secretKey;
  if (opts.privateKey) {
    secretKey = typeof opts.privateKey === 'string' ? hexToBytes(opts.privateKey) : opts.privateKey;
  } else if (opts.seed !== undefined && opts.seed !== null) {
    // Deterministic keys are for tests and reproducible fixtures only. A seed that
    // reaches a relay is a published private key — see the removed "hermes-prod-seed".
    secretKey = sha256(utf8ToBytes(String(opts.seed)));
  } else {
    secretKey = schnorr.keygen().secretKey;
  }
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32) {
    throw new Error('private key must be 32 bytes');
  }

  // BIP-340 x-only public key: the x coordinate of privkey*G. Throws if the scalar
  // is out of range, so an unusable key fails here rather than at the relay.
  const publicKey = schnorr.getPublicKey(secretKey);

  const identity = {
    npub: encodeNip19('npub', publicKey),
    hexPublicKey: bytesToHex(publicKey),
    agentName: opts.agentName || 'hermes-agent',
    capabilities: opts.capabilities || ['acp-code-execution', 'fenced-safety-lease', 'mac-freeze-guard'],
  };

  Object.defineProperty(identity, 'privateKeyBytes', { value: secretKey, enumerable: false });
  Object.defineProperty(identity, 'exportNsec', {
    value: () => encodeNip19('nsec', secretKey),
    enumerable: false,
  });

  return identity;
}

/**
 * NIP-01 event id: sha256 over the UTF-8 JSON serialization of
 * [0, pubkey, created_at, kind, tags, content] with no insignificant whitespace.
 */
function computeEventId(event) {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
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
 * Verify an event the way a relay does: recompute the id from the event body, then
 * check the Schnorr signature against the event's own pubkey. Any tampering with
 * content, tags, kind, timestamp or pubkey changes the id and fails the check.
 */
function verifyNostrEvent(event) {
  if (!event || typeof event.id !== 'string' || typeof event.sig !== 'string') return false;
  try {
    if (computeEventId(event) !== event.id) return false;
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    return false;
  }
}

/** Parse an incoming Buzz event to extract the prompt and target sub-agent. */
function parseBuzzNostrEvent(event) {
  if (!event || typeof event.content !== 'string') {
    return { valid: false, error: 'Invalid Nostr event' };
  }
  const content = event.content.trim();
  const mentionMatch = content.match(/@(hermes(?:-[a-z0-9-]+)?)/i);
  return {
    valid: true,
    eventId: event.id,
    pubkey: event.pubkey,
    targetAgent: mentionMatch ? mentionMatch[1].toLowerCase() : 'hermes',
    prompt: content,
    isBuzzWorkspaceMention: Boolean(mentionMatch),
  };
}

module.exports = {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  verifyNostrEvent,
  computeEventId,
  parseBuzzNostrEvent,
  encodeNip19,
  decodeNip19,
};

// Demo uses an ephemeral random key and never prints secret material.
if (require.main === module) {
  const identity = generateNostrAgentIdentity();
  const event = createNostrAgentEvent({
    identity,
    content: '@hermes-coder refactor authentication handler under fenced safety lease',
    tags: [['t', 'buzz-agent'], ['p', identity.hexPublicKey]],
  });
  console.log('npub:            ', identity.npub);
  console.log('event id:        ', event.id);
  console.log('verifies:        ', verifyNostrEvent(event));
}
