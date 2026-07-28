#!/usr/bin/env node

/**
 * Buzz Nostr Bridge & Agent Identity Manager (@thumbgate/buzz-bridge)
 * Integrates Hermes and ThumbGate with Block Inc's Buzz Nostr relay collaboration network.
 */

const crypto = require("crypto");

/**
 * Generate a deterministic or random Nostr secp256k1 keypair representation for Hermes agent
 * @param {string} [seed] - Optional seed for deterministic key generation
 */
function generateNostrAgentIdentity(seed) {
  const hash = seed
    ? crypto.createHash("sha256").update(seed).digest()
    : crypto.randomBytes(32);

  const hexPrivateKey = hash.toString("hex");
  // Simple derive for demonstration of Nostr npub/nsec format
  const hexPublicKey = crypto.createHash("sha256").update(hash).digest("hex");
  const npub = `npub1${hexPublicKey.slice(0, 32)}`;
  const nsec = `nsec1${hexPrivateKey.slice(0, 32)}`;

  return {
    npub,
    nsec,
    hexPublicKey,
    hexPrivateKey,
    agentName: "hermes-agent",
    capabilities: ["acp-code-execution", "fenced-safety-lease", "mac-freeze-guard"],
  };
}

/**
 * Create a Nostr Event (Kind 1 / Kind 30078) representing a Hermes execution task or response
 */
function createNostrAgentEvent({ identity, content, kind = 1, tags = [] }) {
  const createdAt = Math.floor(Date.now() / 1000);
  const serialized = JSON.stringify([0, identity.hexPublicKey, createdAt, kind, tags, content]);
  const id = crypto.createHash("sha256").update(serialized).digest("hex");

  // HMAC-SHA256 signature under ThumbGate fenced lease
  const sig = crypto.createHmac("sha256", identity.hexPrivateKey).update(id).digest("hex");

  return {
    id,
    pubkey: identity.hexPublicKey,
    npub: identity.npub,
    created_at: createdAt,
    kind,
    tags,
    content,
    sig,
  };
}

/**
 * Parse an incoming Buzz Nostr Event to extract prompt and target sub-agent
 */
function parseBuzzNostrEvent(event) {
  if (!event || typeof event.content !== "string") {
    return { valid: false, error: "Invalid Nostr event" };
  }

  const content = event.content.trim();
  const mentionMatch = content.match(/@(hermes(?:-[a-z0-9-]+)?)/i);
  const targetAgent = mentionMatch ? mentionMatch[1].toLowerCase() : "hermes";

  return {
    valid: true,
    eventId: event.id,
    pubkey: event.pubkey,
    targetAgent,
    prompt: content,
    isBuzzWorkspaceMention: Boolean(mentionMatch),
  };
}

module.exports = {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  parseBuzzNostrEvent,
};

if (require.main === module) {
  const identity = generateNostrAgentIdentity("hermes-prod-seed");
  console.log("🐝 Buzz Nostr Agent Identity Initialized:");
  console.log(`   Npub: ${identity.npub}`);
  console.log(`   Nsec: ${identity.nsec}`);

  const sampleEvent = createNostrAgentEvent({
    identity,
    content: "@hermes-coder refactor authentication handler under fenced safety lease",
    tags: [["t", "buzz-agent"], ["p", identity.hexPublicKey]],
  });

  console.log("\n📦 Sample Buzz Nostr Event:");
  console.log(JSON.stringify(sampleEvent, null, 2));
}
