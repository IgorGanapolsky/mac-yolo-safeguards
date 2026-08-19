/**
 * Strip unused system-prompt / unused tool preamble so a hosted run
 * does not burn tokens on harness junk that does not apply.
 * Always keep spend=0 / approval gate lines.
 *
 * Refuse: TrueForge product, Tavily, OTel, MCP Gateway, generative UI,
 * Claude Managed Agents clone, $499.
 */

export const HOSTED_GATE_LINES = Object.freeze([
  "Spend is $0 unless an approval is granted (gateway-budget).",
  "Money, customer, and production actions require a human gate on thumbgate.app.",
]);

const UNUSED_BLOCK_RES = [
  /<unused-tools>[\s\S]*?<\/unused-tools>/gi,
  /<unused-system>[\s\S]*?<\/unused-system>/gi,
  /<!--\s*unused[\s\S]*?-->/gi,
];

function toolName(tool) {
  if (typeof tool === "string") return tool;
  return String(tool?.name ?? "").trim();
}

/**
 * @param {{
 *   system?: string,
 *   tools?: Array<string | { name?: string, preamble?: string }>,
 *   usedTools?: string[],
 * }} input
 */
export function trimHostedPrompt(input = {}) {
  const original = String(input.system ?? "");
  let system = original;
  const tools = Array.isArray(input.tools) ? input.tools : [];
  const usedList = Array.isArray(input.usedTools)
    ? input.usedTools
    : tools.map(toolName).filter(Boolean);
  const used = new Set(usedList.map(String));

  for (const tool of tools) {
    const name = toolName(tool);
    const preamble = typeof tool === "object" && tool && typeof tool.preamble === "string"
      ? tool.preamble
      : "";
    if (name && preamble && !used.has(name)) {
      system = system.split(preamble).join("");
    }
  }
  for (const re of UNUSED_BLOCK_RES) {
    system = system.replace(re, "");
  }
  system = system.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  for (const line of HOSTED_GATE_LINES) {
    if (!system.includes(line)) {
      system = system ? `${system}\n${line}` : line;
    }
  }

  return {
    system,
    originalLength: original.length,
    trimmedLength: system.length,
    gateLines: HOSTED_GATE_LINES.slice(),
  };
}
