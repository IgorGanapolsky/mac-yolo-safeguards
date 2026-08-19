export const HOSTED_GATE_LINES: readonly [
  "Spend is $0 unless an approval is granted (gateway-budget).",
  "Money, customer, and production actions require a human gate on thumbgate.app.",
];

export function trimHostedPrompt(input?: {
  system?: string;
  tools?: Array<string | { name?: string; preamble?: string }>;
  usedTools?: string[];
}): {
  system: string;
  originalLength: number;
  trimmedLength: number;
  gateLines: string[];
};
