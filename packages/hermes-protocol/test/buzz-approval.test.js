import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from "nostr-tools/pure";

import {
  BUZZ_APPROVAL_DENY_KIND,
  BUZZ_APPROVAL_GRANT_KIND,
  BUZZ_APPROVAL_REQUEST_KIND,
  BuzzApprovalDecisionGuard,
  BuzzApprovalProtocolError,
  BuzzApprovalReplayGuard,
  buildBuzzApprovalDecision,
  hashBuzzApprovalToken,
  parseBuzzApprovalRequest,
  verifyBuzzApprovalDecision,
} from "../src/buzz-approval.js";

const NOW = 1_785_330_000;
const RAW_TOKEN = "not-a-secret-test-approval-token";

function expectProtocolError(code) {
  return (error) => {
    assert.ok(error instanceof BuzzApprovalProtocolError);
    assert.equal(error.code, code);
    return true;
  };
}

function fixture({
  requesterSecret = generateSecretKey(),
  approverSecret = generateSecretKey(),
  kind = BUZZ_APPROVAL_REQUEST_KIND,
  createdAt = NOW - 10,
  expiresAt = NOW + 300,
  tokenHash = hashBuzzApprovalToken(RAW_TOKEN),
  content = "Deploy release 1.4.2 to production",
  tags,
} = {}) {
  const approverPubkey = getPublicKey(approverSecret);
  const template = {
    kind,
    created_at: createdAt,
    tags:
      tags ??
      [
        ["d", tokenHash],
        ["p", approverPubkey],
        ["expiration", String(expiresAt)],
      ],
    content,
  };
  return {
    approverPubkey,
    approverSecret,
    event: finalizeEvent(template, requesterSecret),
    requesterSecret,
    tokenHash,
  };
}

function parseFixture(value, options = {}) {
  return parseBuzzApprovalRequest(value.event, {
    approverPubkey: value.approverPubkey,
    nowSeconds: NOW,
    ...options,
  });
}

test("accepts a real BIP-340 signed request as a Hermes relay_hook approval", () => {
  const value = fixture();
  assert.equal(verifyEvent(value.event), true);

  const request = parseFixture(value);

  assert.deepEqual(request, {
    eventId: value.event.id,
    source: "relay_hook",
    tokenHash: value.tokenHash,
    requesterPubkey: value.event.pubkey,
    approverPubkey: value.approverPubkey,
    title: "Deploy release 1.4.2 to production",
    reason: "Deploy release 1.4.2 to production",
    allowPermanent: false,
    createdAtSeconds: NOW - 10,
    expiresAtSeconds: NOW + 300,
    receivedAt: new Date((NOW - 10) * 1_000).toISOString(),
  });
  assert.equal(Object.isFrozen(request), true);
});

test("rejects unsigned, tampered, and wrong-kind requests", async (t) => {
  const value = fixture();

  await t.test("unsigned", () => {
    const { id: _id, sig: _sig, ...unsigned } = value.event;
    assert.throws(
      () =>
        parseBuzzApprovalRequest(unsigned, {
          approverPubkey: value.approverPubkey,
          nowSeconds: NOW,
        }),
      expectProtocolError("invalid_event"),
    );
  });

  await t.test("tampered", () => {
    assert.throws(
      () =>
        parseBuzzApprovalRequest(
          { ...value.event, content: "Deploy attacker payload" },
          {
            approverPubkey: value.approverPubkey,
            nowSeconds: NOW,
          },
        ),
      expectProtocolError("invalid_signature"),
    );
  });

  await t.test("wrong kind with valid signature", () => {
    const wrongKind = fixture({
      requesterSecret: value.requesterSecret,
      approverSecret: value.approverSecret,
      kind: 1,
    });
    assert.throws(
      () => parseFixture(wrongKind),
      expectProtocolError("wrong_kind"),
    );
  });
});

test("fails closed on malformed or ambiguous request tags", async (t) => {
  const approverSecret = generateSecretKey();
  const approverPubkey = getPublicKey(approverSecret);
  const cases = [
    {
      name: "missing token",
      tags: [["p", approverPubkey], ["expiration", String(NOW + 10)]],
      code: "missing_tag",
    },
    {
      name: "invalid token hash",
      tags: [["d", "abc"], ["p", approverPubkey], ["expiration", String(NOW + 10)]],
      code: "invalid_hex",
    },
    {
      name: "duplicate token",
      tags: [
        ["d", "a".repeat(64)],
        ["d", "b".repeat(64)],
        ["p", approverPubkey],
        ["expiration", String(NOW + 10)],
      ],
      code: "ambiguous_tag",
    },
    {
      name: "missing approver",
      tags: [["d", "a".repeat(64)], ["expiration", String(NOW + 10)]],
      code: "missing_tag",
    },
    {
      name: "duplicate approver",
      tags: [
        ["d", "a".repeat(64)],
        ["p", approverPubkey],
        ["p", approverPubkey],
        ["expiration", String(NOW + 10)],
      ],
      code: "ambiguous_tag",
    },
    {
      name: "missing expiry",
      tags: [["d", "a".repeat(64)], ["p", approverPubkey]],
      code: "missing_tag",
    },
    {
      name: "invalid expiry",
      tags: [
        ["d", "a".repeat(64)],
        ["p", approverPubkey],
        ["expiration", "tomorrow"],
      ],
      code: "invalid_expiry",
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const value = fixture({ approverSecret, tags: item.tags });
      assert.throws(
        () => parseFixture(value),
        expectProtocolError(item.code),
      );
    });
  }
});

test("rejects wrong approver, expiry failures, future events, and missing context", async (t) => {
  await t.test("wrong approver", () => {
    const value = fixture();
    assert.throws(
      () =>
        parseBuzzApprovalRequest(value.event, {
          approverPubkey: getPublicKey(generateSecretKey()),
          nowSeconds: NOW,
        }),
      expectProtocolError("wrong_approver"),
    );
  });

  await t.test("expiry before creation", () => {
    const value = fixture({ createdAt: NOW, expiresAt: NOW });
    assert.throws(
      () => parseFixture(value),
      expectProtocolError("invalid_expiry"),
    );
  });

  await t.test("expired", () => {
    const value = fixture({ createdAt: NOW - 20, expiresAt: NOW - 1 });
    assert.throws(
      () => parseFixture(value),
      expectProtocolError("expired_request"),
    );
  });

  await t.test("future event", () => {
    const value = fixture({ createdAt: NOW + 61 });
    assert.throws(
      () => parseFixture(value),
      expectProtocolError("future_event"),
    );
  });

  await t.test("empty content", () => {
    const value = fixture({ content: "   " });
    assert.throws(
      () => parseFixture(value),
      expectProtocolError("missing_context"),
    );
  });

  await t.test("oversized content", () => {
    const value = fixture({ content: "x".repeat(4_097) });
    assert.throws(
      () => parseFixture(value),
      expectProtocolError("text_too_long"),
    );
  });
});

test("replay guard rejects duplicates, fails closed at capacity, and prunes expiry", () => {
  const guard = new BuzzApprovalReplayGuard({ maxEntries: 1 });
  const first = fixture();
  parseFixture(first, { replayGuard: guard });
  assert.equal(guard.size, 1);
  assert.throws(
    () => parseFixture(first, { replayGuard: guard }),
    expectProtocolError("replayed_request"),
  );

  const second = fixture();
  assert.throws(
    () => parseFixture(second, { replayGuard: guard }),
    expectProtocolError("replay_guard_capacity"),
  );

  const later = NOW + 301;
  const afterExpiry = fixture({
    createdAt: later - 1,
    expiresAt: later + 100,
    tokenHash: "c".repeat(64),
  });
  parseBuzzApprovalRequest(afterExpiry.event, {
    approverPubkey: afterExpiry.approverPubkey,
    nowSeconds: later,
    replayGuard: guard,
  });
  assert.equal(guard.size, 1);
});

test("builds relay-compatible signed grant and deny without exposing the raw token", async (t) => {
  for (const [decision, expectedKind] of [
    ["approve", BUZZ_APPROVAL_GRANT_KIND],
    ["deny", BUZZ_APPROVAL_DENY_KIND],
  ]) {
    await t.test(decision, () => {
      const value = fixture();
      const request = parseFixture(value);
      const event = buildBuzzApprovalDecision(request, {
        decision,
        secretKey: value.approverSecret,
        note: decision === "approve" ? "Reviewed on Hermes Mobile" : "",
        nowSeconds: NOW,
      });

      assert.equal(event.kind, expectedKind);
      assert.equal(event.pubkey, value.approverPubkey);
      assert.equal(verifyEvent(event), true);
      assert.deepEqual(event.tags, [
        ["d", value.tokenHash],
        ["e", value.event.id],
        ["p", value.event.pubkey],
      ]);
      assert.equal(JSON.stringify(event).includes(RAW_TOKEN), false);

      const receipt = verifyBuzzApprovalDecision(event, request, {
        nowSeconds: NOW,
      });
      assert.equal(receipt.decision, decision);
      assert.equal(receipt.tokenHash, value.tokenHash);
      assert.equal(Object.isFrozen(receipt), true);
    });
  }
});

test("decision creation rejects wrong keys, choices, expiry, and duplicates", async (t) => {
  const value = fixture();
  const request = parseFixture(value);

  for (const [name, options, code] of [
    [
      "wrong key",
      { decision: "approve", secretKey: generateSecretKey(), nowSeconds: NOW },
      "wrong_signer",
    ],
    [
      "short key",
      { decision: "approve", secretKey: new Uint8Array(31), nowSeconds: NOW },
      "invalid_secret_key",
    ],
    [
      "invalid choice",
      { decision: "always", secretKey: value.approverSecret, nowSeconds: NOW },
      "invalid_decision",
    ],
    [
      "expired",
      {
        decision: "deny",
        secretKey: value.approverSecret,
        nowSeconds: NOW + 300,
      },
      "expired_request",
    ],
    [
      "oversized note",
      {
        decision: "deny",
        secretKey: value.approverSecret,
        nowSeconds: NOW,
        note: "x".repeat(1_025),
      },
      "text_too_long",
    ],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => buildBuzzApprovalDecision(request, options),
        expectProtocolError(code),
      );
    });
  }

  await t.test("invalid guard", () => {
    assert.throws(
      () =>
        buildBuzzApprovalDecision(request, {
          decision: "approve",
          secretKey: value.approverSecret,
          nowSeconds: NOW,
          decisionGuard: {},
        }),
      expectProtocolError("invalid_decision_guard"),
    );
  });

  await t.test("duplicate", () => {
    const guard = new BuzzApprovalDecisionGuard();
    buildBuzzApprovalDecision(request, {
      decision: "approve",
      secretKey: value.approverSecret,
      nowSeconds: NOW,
      decisionGuard: guard,
    });
    assert.equal(guard.size, 1);
    assert.throws(
      () =>
        buildBuzzApprovalDecision(request, {
          decision: "deny",
          secretKey: value.approverSecret,
          nowSeconds: NOW,
          decisionGuard: guard,
        }),
      expectProtocolError("duplicate_decision"),
    );
  });
});

test("decision verification rejects tampering, wrong kinds, signers, and references", async (t) => {
  const value = fixture();
  const request = parseFixture(value);
  const event = buildBuzzApprovalDecision(request, {
    decision: "approve",
    secretKey: value.approverSecret,
    nowSeconds: NOW,
  });

  await t.test("tampered", () => {
    assert.throws(
      () =>
        verifyBuzzApprovalDecision(
          { ...event, content: "changed after signing" },
          request,
          { nowSeconds: NOW },
        ),
      expectProtocolError("invalid_signature"),
    );
  });

  await t.test("wrong kind", () => {
    const wrongKind = finalizeEvent(
      { kind: 1, created_at: NOW, tags: event.tags, content: "" },
      value.approverSecret,
    );
    assert.throws(
      () =>
        verifyBuzzApprovalDecision(wrongKind, request, { nowSeconds: NOW }),
      expectProtocolError("wrong_kind"),
    );
  });

  await t.test("wrong signer", () => {
    const wrongSigner = finalizeEvent(
      {
        kind: event.kind,
        created_at: NOW,
        tags: event.tags,
        content: "",
      },
      generateSecretKey(),
    );
    assert.throws(
      () =>
        verifyBuzzApprovalDecision(wrongSigner, request, { nowSeconds: NOW }),
      expectProtocolError("wrong_signer"),
    );
  });

  for (const [name, tagName, tagValue] of [
    ["token", "d", "f".repeat(64)],
    ["request event", "e", "e".repeat(64)],
    ["requester", "p", "d".repeat(64)],
  ]) {
    await t.test(name, () => {
      const tags = event.tags.map((tag) =>
        tag[0] === tagName ? [tagName, tagValue] : tag,
      );
      const mismatched = finalizeEvent(
        {
          kind: event.kind,
          created_at: NOW,
          tags,
          content: "",
        },
        value.approverSecret,
      );
      assert.throws(
        () =>
          verifyBuzzApprovalDecision(mismatched, request, {
            nowSeconds: NOW,
          }),
        expectProtocolError("wrong_reference"),
      );
    });
  }
});

test("hashes tokens exactly as Buzz and rejects unsafe configuration", () => {
  assert.equal(
    hashBuzzApprovalToken(RAW_TOKEN),
    createHash("sha256").update(RAW_TOKEN, "utf8").digest("hex"),
  );
  assert.throws(
    () => hashBuzzApprovalToken(""),
    expectProtocolError("invalid_token"),
  );
  assert.throws(
    () => hashBuzzApprovalToken("x".repeat(257)),
    expectProtocolError("invalid_token"),
  );
  assert.throws(
    () => new BuzzApprovalReplayGuard({ maxEntries: 0 }),
    expectProtocolError("invalid_capacity"),
  );
  assert.throws(
    () => new BuzzApprovalDecisionGuard({ maxEntries: 0 }),
    expectProtocolError("invalid_capacity"),
  );

  const value = fixture();
  assert.throws(
    () => parseFixture(value, { replayGuard: {} }),
    expectProtocolError("invalid_replay_guard"),
  );
  assert.throws(
    () => parseFixture(value, { maxFutureSkewSeconds: -1 }),
    expectProtocolError("invalid_clock_skew"),
  );
});
