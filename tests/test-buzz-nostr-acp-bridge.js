const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  parseBuzzNostrEvent,
} = require("../tools/buzz-nostr-bridge.js");

test("Nostr Agent Identity Generation", () => {
  const identity = generateNostrAgentIdentity("test-seed-123");
  assert.ok(identity.npub.startsWith("npub1"));
  assert.ok(identity.nsec.startsWith("nsec1"));
  assert.equal(identity.agentName, "hermes-agent");
});

test("Nostr Event Creation & Verification", () => {
  const identity = generateNostrAgentIdentity("test-seed-456");
  const event = createNostrAgentEvent({
    identity,
    content: "@hermes-devops deploy latest release candidate",
    tags: [["t", "buzz"]],
  });

  assert.ok(event.id);
  assert.ok(event.sig);
  assert.equal(event.pubkey, identity.hexPublicKey);
  assert.equal(event.content, "@hermes-devops deploy latest release candidate");
});

test("Buzz Nostr Event Parsing & Sub-agent Routing", () => {
  const event = {
    id: "evt123",
    pubkey: "pub123",
    content: "@hermes-reviewer review pull request #42",
  };

  const parsed = parseBuzzNostrEvent(event);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.targetAgent, "hermes-reviewer");
  assert.equal(parsed.isBuzzWorkspaceMention, true);
});
