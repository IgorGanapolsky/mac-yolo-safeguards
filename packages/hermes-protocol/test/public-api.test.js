import assert from "node:assert/strict";
import test from "node:test";

import * as protocol from "../src/index.js";

test("public runtime API remains explicit and complete", () => {
  assert.deepEqual(Object.keys(protocol).sort(), [
    "MutationConflictError",
    "PROTOCOL_SCHEMA_VERSION",
    "ProtocolValidationError",
    "RelayStore",
    "THREAD_EVENT_KINDS",
    "ThreadDeletedError",
    "closeServer",
    "createRelayHttpServer",
    "listenOnRandomPort",
    "mutationFingerprint",
    "projectThread",
    "validateEvent",
    "validateId",
    "validateMutation",
    "validatePayload",
  ]);
});
