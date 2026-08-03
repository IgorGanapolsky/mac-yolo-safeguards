const test = require("node:test");
const assert = require("node:assert/strict");
const { schnorr } = require("@noble/curves/secp256k1.js");
const { sha256 } = require("@noble/hashes/sha2.js");
const { bytesToHex, hexToBytes, utf8ToBytes } = require("@noble/hashes/utils.js");
const { bech32 } = require("@scure/base");
const {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  verifyNostrEvent,
  computeEventId,
  parseBuzzNostrEvent,
  encodeNip19,
  decodeNip19,
} = require("../tools/buzz-nostr-bridge.js");

// These assertions deliberately check against BIP-340 / NIP-01 / NIP-19 rules and an
// external test vector -- never against our own output. The previous suite passed 3/3
// on an implementation that used sha256 as key derivation and HMAC as a "signature",
// because it only asserted that `sig` was truthy and that `npub` started with "npub1".

test("NIP-19: encoding matches the canonical spec test vector", () => {
  const HEX = "67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa";
  const EXPECTED = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
  assert.equal(encodeNip19("nsec", hexToBytes(HEX)), EXPECTED);
  assert.equal(bytesToHex(decodeNip19("nsec", EXPECTED)), HEX);
});

test("NIP-19: npub is real bech32 over all 32 bytes with a valid checksum", () => {
  const identity = generateNostrAgentIdentity("test-seed-123");

  // Length is fixed by bech32 for a 32-byte payload: "npub" + "1" + 52 data + 6 checksum.
  assert.equal(identity.npub.length, 63);
  assert.ok(identity.npub.startsWith("npub1"));

  // Decodes back to the exact public key -- the old truncated form kept only 16 bytes.
  assert.equal(bytesToHex(decodeNip19("npub", identity.npub)), identity.hexPublicKey);

  // A single corrupted character must fail the checksum.
  const corrupted = `${identity.npub.slice(0, -1)}${identity.npub.at(-1) === "q" ? "p" : "q"}`;
  assert.throws(() => bech32.decode(corrupted, 1000));
});

test("keypair: public key is privkey*G (BIP-340), not a hash of the private key", () => {
  const identity = generateNostrAgentIdentity("test-seed-123");
  const derived = bytesToHex(schnorr.getPublicKey(identity.privateKeyBytes));
  assert.equal(identity.hexPublicKey, derived);

  // Guard against a regression back to sha256-as-derivation.
  const hashed = bytesToHex(sha256(identity.privateKeyBytes));
  assert.notEqual(identity.hexPublicKey, hashed);
});

test("NIP-01: event id is sha256 of the canonical serialization", () => {
  const identity = generateNostrAgentIdentity("test-seed-456");
  const event = createNostrAgentEvent({
    identity,
    content: "@hermes-devops deploy latest release candidate",
    tags: [["t", "buzz"]],
    createdAt: 1735689600,
  });
  const expected = bytesToHex(sha256(utf8ToBytes(JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ]))));
  assert.equal(event.id, expected);
  assert.equal(event.pubkey, identity.hexPublicKey);
});

test("NIP-01: signature verifies under BIP-340 without the private key", () => {
  const identity = generateNostrAgentIdentity("test-seed-456");
  const event = createNostrAgentEvent({ identity, content: "@hermes ping" });

  // Verified with ONLY public material -- an HMAC cannot satisfy this.
  assert.equal(
    schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey)),
    true,
  );
  assert.equal(verifyNostrEvent(event), true);
  assert.equal(event.sig.length, 128); // 64-byte Schnorr signature as hex
});

test("tamper detection: any mutation of the event body fails verification", () => {
  const identity = generateNostrAgentIdentity("test-seed-789");
  const event = createNostrAgentEvent({
    identity,
    content: "@hermes-coder apply patch",
    tags: [["t", "buzz"]],
    createdAt: 1735689600,
  });
  assert.equal(verifyNostrEvent(event), true);

  assert.equal(verifyNostrEvent({ ...event, content: "@hermes-coder rm -rf /" }), false);
  assert.equal(verifyNostrEvent({ ...event, tags: [["t", "evil"]] }), false);
  assert.equal(verifyNostrEvent({ ...event, created_at: event.created_at + 1 }), false);
  assert.equal(verifyNostrEvent({ ...event, kind: 30078 }), false);

  // Substituting another agent's pubkey must not verify.
  const other = generateNostrAgentIdentity("someone-else");
  assert.equal(verifyNostrEvent({ ...event, pubkey: other.hexPublicKey }), false);

  // A forged signature over an unchanged id must not verify.
  assert.equal(verifyNostrEvent({ ...event, sig: "00".repeat(64) }), false);
});

test("secret hygiene: private key never appears in serialized output", () => {
  const identity = generateNostrAgentIdentity("test-seed-123");
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes(bytesToHex(identity.privateKeyBytes)), false);
  assert.equal(serialized.includes(identity.exportNsec()), false);
  assert.equal(Object.keys(identity).includes("privateKeyBytes"), false);
  assert.equal(Object.keys(identity).includes("nsec"), false);

  // Available only when asked for by name, and valid when asked.
  assert.ok(identity.exportNsec().startsWith("nsec1"));
  assert.equal(
    bytesToHex(decodeNip19("nsec", identity.exportNsec())),
    bytesToHex(identity.privateKeyBytes),
  );
});

test("identity: seeds are deterministic, random keys are not", () => {
  assert.equal(
    generateNostrAgentIdentity("same-seed").hexPublicKey,
    generateNostrAgentIdentity("same-seed").hexPublicKey,
  );
  assert.notEqual(
    generateNostrAgentIdentity().hexPublicKey,
    generateNostrAgentIdentity().hexPublicKey,
  );
  assert.equal(generateNostrAgentIdentity("s").agentName, "hermes-agent");
  assert.equal(generateNostrAgentIdentity({ agentName: "hermes-coder" }).agentName, "hermes-coder");
});

test("Buzz Nostr Event Parsing & Sub-agent Routing", () => {
  const parsed = parseBuzzNostrEvent({
    id: "evt123",
    pubkey: "pub123",
    content: "@hermes-reviewer review pull request #42",
  });
  assert.equal(parsed.valid, true);
  assert.equal(parsed.targetAgent, "hermes-reviewer");
  assert.equal(parsed.isBuzzWorkspaceMention, true);

  assert.equal(parseBuzzNostrEvent({ content: "no mention here" }).targetAgent, "hermes");
  assert.equal(parseBuzzNostrEvent(null).valid, false);
  assert.equal(parseBuzzNostrEvent({ content: 42 }).valid, false);
});
