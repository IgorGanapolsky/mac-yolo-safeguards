import { describe, expect, it } from "vitest";
import {
  TOOL_PROTOCOL_INCOMPLETE_MESSAGE,
  hasLeakedToolProtocol,
  readableChatOutput,
} from "./chat-output-safety";

const dsml = `<|DSML|tool_calls>
<|DSML|invoke name="shell">
<|DSML|parameter name="command" string="true">curl -s -L https://explainx.ai/trending | head -c 8000</|DSML|parameter>
</|DSML|invoke>
</|DSML|tool_calls>`;

describe("readableChatOutput", () => {
  it("replaces the exact leaked DSML from the production screenshot with plain language", () => {
    expect(readableChatOutput(`Let me fetch that URL.\n${dsml}`)).toBe(
      `Let me fetch that URL.\n\n${TOOL_PROTOCOL_INCOMPLETE_MESSAGE}`,
    );
  });

  it("handles truncated DSML without showing wire syntax", () => {
    const rendered = readableChatOutput("Starting now.\n<|DSML|tool_calls>\n<|DSML|invoke name=\"shell\">");
    expect(rendered).toBe(`Starting now.\n\n${TOOL_PROTOCOL_INCOMPLETE_MESSAGE}`);
    expect(rendered).not.toContain("DSML");
  });

  it("also strips common XML tool-call envelopes", () => {
    expect(readableChatOutput("<tool_call><command>secret wire payload</command></tool_call>")).toBe(
      TOOL_PROTOCOL_INCOMPLETE_MESSAGE,
    );
  });

  it("does not rewrite normal assistant prose or code", () => {
    const normal = "Use `curl https://example.com` to inspect the endpoint.";
    expect(hasLeakedToolProtocol(normal)).toBe(false);
    expect(readableChatOutput(normal)).toBe(normal);
  });
});
