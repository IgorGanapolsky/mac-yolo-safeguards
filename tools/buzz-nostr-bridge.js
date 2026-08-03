#!/usr/bin/env node
'use strict';

/**
 * Buzz / Nostr bridge helpers for Hermes harness (mac-yolo-safeguards).
 *
 * Maps onto Nous Hermes Agent × Block Buzz integration patterns (ACP + Nostr
 * event log). See docs/HERMES-BUZZ-INTEGRATION.md.
 *
 * Crypto is NIP-01 + NIP-19 (BIP-340 Schnorr, bech32 npub/nsec) via
 * @noble/curves (secp256k1 schnorr) and @scure/base — NOT sha256(priv) / HMAC theater.
 *
 * Attribution:
 * - Hermes Agent: Nous Research (https://github.com/NousResearch/hermes-agent)
 * - Buzz: open-source Nostr workspace (https://github.com/block/buzz)
 * No affiliation claim with either project.
 */

const crypto = require('crypto');
const { schnorr } = require('@noble/curves/secp256k1');
const { bech32 } = require('@scure/base');

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0) {
    throw new Error('invalid hex');
  }
  return Uint8Array.from(Buffer.from(h, 'hex'));
}

function bech32Encode(hrp, dataBytes) {
  const words = bech32.toWords(dataBytes);
  return bech32.encode(hrp, words, false);
}

function bech32Decode(str) {
  const decoded = bech32.decode(str, false);
  const data = bech32.fromWords(decoded.words);
  return { prefix: decoded.prefix, bytes: Uint8Array.from(data) };
}

/**
 * Generate a Nostr keypair. Prefer random; seed only for tests (HKDF, not raw sha256(seed) as identity).
 * @param {object} [opts]
 * @param {string|Buffer|Uint8Array} [opts.seed] - test-only entropy
 * @param {boolean} [opts.allowInsecureSeed] - must be true to use seed (prevents prod accidents)
 */
function generateNostrAgentIdentity(opts = {}) {
  let priv;
  if (opts.seed != null) {
    if (!opts.allowInsecureSeed) {
      throw new Error(
        'Refusing seed-derived keys without allowInsecureSeed:true (prod must use random)',
      );
    }
    // HKDF-SHA256 → 32 bytes (better than sha256(seed) alone; still test-only)
    priv = crypto.hkdfSync(
      'sha256',
      Buffer.from(String(opts.seed), 'utf8'),
      Buffer.from('hermes-nostr-test-v1'),
      Buffer.from('nip01-privkey'),
      32,
    );
  } else {
    priv = crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(32))
      : crypto.randomBytes(32);
  }
  const privBytes = priv instanceof Uint8Array ? priv : new Uint8Array(priv);
  // BIP-340: private key must be in valid range; noble validates on use
  const pubBytes = schnorr.getPublicKey(privBytes);
  const hexPrivateKey = bytesToHex(privBytes);
  const hexPublicKey = bytesToHex(pubBytes);
  return {
    npub: bech32Encode('npub', pubBytes),
    nsec: bech32Encode('nsec', privBytes),
    hexPublicKey,
    hexPrivateKey,
    agentName: 'hermes-agent',
    capabilities: ['acp', 'nostr-nip01', 'fenced-safety-lease'],
  };
}

function nsecToHex(nsec) {
  const { prefix, bytes } = bech32Decode(nsec);
  if (prefix !== 'nsec') throw new Error(`expected nsec, got ${prefix}`);
  if (bytes.length !== 32) throw new Error('nsec must decode to 32 bytes');
  return bytesToHex(bytes);
}

function npubToHex(npub) {
  const { prefix, bytes } = bech32Decode(npub);
  if (prefix !== 'npub') throw new Error(`expected npub, got ${prefix}`);
  if (bytes.length !== 32) throw new Error('npub must decode to 32 bytes');
  return bytesToHex(bytes);
}

/**
 * NIP-01 event id: sha256 of UTF-8 JSON array
 * [0, pubkey, created_at, kind, tags, content]
 */
function serializeEventForId(event) {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags || [],
    event.content,
  ]);
}

function computeEventId(event) {
  return crypto.createHash('sha256').update(serializeEventForId(event)).digest('hex');
}

/**
 * Create a signed NIP-01 event (default kind 1 note).
 * Does not print secrets.
 */
function createNostrAgentEvent({ identity, content, kind = 1, tags = [], createdAt }) {
  if (!identity || !identity.hexPrivateKey || !identity.hexPublicKey) {
    throw new Error('identity with hexPrivateKey and hexPublicKey required');
  }
  const created_at = createdAt ?? Math.floor(Date.now() / 1000);
  const unsigned = {
    pubkey: identity.hexPublicKey,
    created_at,
    kind,
    tags: Array.isArray(tags) ? tags : [],
    content: String(content ?? ''),
  };
  const id = computeEventId(unsigned);
  const sig = bytesToHex(schnorr.sign(id, hexToBytes(identity.hexPrivateKey)));
  return { id, ...unsigned, sig };
}

/**
 * Verify NIP-01 id + BIP-340 Schnorr signature.
 */
function verifyNostrEvent(event) {
  if (!event || !event.id || !event.pubkey || !event.sig) {
    return { valid: false, error: 'missing id/pubkey/sig' };
  }
  try {
    const expectedId = computeEventId(event);
    if (expectedId !== event.id) {
      return { valid: false, error: 'event id does not match NIP-01 serialization' };
    }
    const ok = schnorr.verify(hexToBytes(event.sig), event.id, hexToBytes(event.pubkey));
    return ok ? { valid: true } : { valid: false, error: 'schnorr verification failed' };
  } catch (e) {
    return { valid: false, error: e.message || String(e) };
  }
}

/**
 * Parse agent-directed content (mentions) for Hermes routing.
 */
function parseBuzzNostrEvent(event) {
  const verified = verifyNostrEvent(event);
  if (!verified.valid) {
    return { valid: false, error: verified.error || 'Invalid Nostr event', verified };
  }
  const content = String(event.content || '').trim();
  const mentionMatch = content.match(/@(hermes(?:-[a-z0-9-]+)?)/i);
  const targetAgent = mentionMatch ? mentionMatch[1].toLowerCase() : 'hermes';
  return {
    valid: true,
    verified: true,
    eventId: event.id,
    pubkey: event.pubkey,
    targetAgent,
    prompt: content,
    isBuzzWorkspaceMention: Boolean(mentionMatch),
  };
}

/**
 * Map a verified Nostr event into an ACP-shaped message for acp-transformer.
 */
function nostrEventToAcpMessage(event, { senderName } = {}) {
  const parsed = parseBuzzNostrEvent(event);
  if (!parsed.valid) {
    throw new Error(parsed.error || 'invalid event');
  }
  return {
    protocolVersion: '1.0',
    sender: {
      id: event.pubkey,
      role: 'user',
      name: senderName || 'nostr-user',
    },
    payload: {
      text: parsed.prompt,
      action: 'agent_task',
      context: { targetAgent: parsed.targetAgent },
    },
    metadata: {
      nostrEventId: event.id,
    },
  };
}

module.exports = {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  verifyNostrEvent,
  parseBuzzNostrEvent,
  nostrEventToAcpMessage,
  nsecToHex,
  npubToHex,
  computeEventId,
  bech32Encode,
  bech32Decode,
};

if (require.main === module) {
  // Demo: random identity, never print nsec unless HERMES_NOSTR_PRINT_NSEC=1
  const identity = generateNostrAgentIdentity();
  console.log('Buzz/Nostr agent identity (public only):');
  console.log(`  npub: ${identity.npub}`);
  console.log(`  hexPublicKey: ${identity.hexPublicKey}`);
  if (process.env.HERMES_NOSTR_PRINT_NSEC === '1') {
    console.log(`  nsec: ${identity.nsec}`);
  } else {
    console.log('  nsec: (hidden — set HERMES_NOSTR_PRINT_NSEC=1 to show)');
  }

  const event = createNostrAgentEvent({
    identity,
    content: '@hermes-coder review the ACP bridge under fenced safety lease',
    tags: [
      ['t', 'hermes-agent'],
      ['client', 'mac-yolo-safeguards'],
    ],
  });
  const v = verifyNostrEvent(event);
  console.log('\nSample NIP-01 event (verified=' + v.valid + '):');
  // strip nothing secret from event (priv not included)
  console.log(JSON.stringify(event, null, 2));
  if (!v.valid) process.exit(1);
}
