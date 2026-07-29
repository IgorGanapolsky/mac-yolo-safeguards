import assert from "node:assert/strict";
import test from "node:test";

import * as protocol from "../src/index.js";

test("public runtime API remains explicit and complete", () => {
  assert.deepEqual(Object.keys(protocol).sort(), [
    "BUZZ_APPROVAL_DENY_KIND",
    "BUZZ_APPROVAL_GRANT_KIND",
    "BUZZ_APPROVAL_REQUEST_KIND",
    "BuzzApprovalDecisionGuard",
    "BuzzApprovalProtocolError",
    "BuzzApprovalReplayGuard",
    "MutationConflictError",
    "PROTOCOL_SCHEMA_VERSION",
    "ProtocolValidationError",
    "RelayStore",
    "THREAD_EVENT_KINDS",
    "ThreadDeletedError",
    "buildBuzzApprovalDecision",
    "closeServer",
    "createRelayHttpServer",
    "hashBuzzApprovalToken",
    "listenOnRandomPort",
    "mutationFingerprint",
    "parseBuzzApprovalRequest",
    "projectThread",
    "validateEvent",
    "validateId",
    "validateMutation",
    "validatePayload",
    "verifyBuzzApprovalDecision",
  ]);
});
