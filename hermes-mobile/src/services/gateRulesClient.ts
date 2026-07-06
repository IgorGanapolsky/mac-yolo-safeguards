import { buildAuthHeaders, normalizeGatewayUrl } from './gatewayClient';
import type { GateRule, GateRuleDecision, GateRulesFetchResult } from '../types/gateRule';
import { parseGateRulesPayload } from '../utils/gateRulesParsing';

export const GATE_RULES_ENDPOINT = '/v1/gates';

const DEMO_GATE_RULES: GateRule[] = [
  {
    id: 'demo-allow-npm-test',
    pattern: 'npm test',
    toolName: 'Bash',
    decision: 'allow',
    scope: 'always',
    source: 'demo',
  },
  {
    id: 'demo-block-rm-rf',
    pattern: 'rm -rf',
    toolName: 'Bash',
    decision: 'block',
    scope: 'always',
    source: 'demo',
  },
];

function base(gatewayUrl: string): string {
  return normalizeGatewayUrl(gatewayUrl).httpBase;
}

export async function listGateRules(
  gatewayUrl: string,
  apiKey?: string | null,
  options?: { demoMode?: boolean },
): Promise<GateRulesFetchResult> {
  const endpoint = `${base(gatewayUrl)}${GATE_RULES_ENDPOINT}`;
  if (options?.demoMode) {
    return { rules: DEMO_GATE_RULES, endpoint };
  }
  if (!gatewayUrl.trim()) {
    return {
      rules: [],
      endpoint,
      unavailableReason: 'Connect a computer in Settings to load gate rules from the gateway.',
    };
  }
  try {
    const response = await fetch(endpoint, {
      headers: buildAuthHeaders(apiKey),
    });
    if (response.status === 404) {
      return {
        rules: [],
        endpoint,
        unavailableReason:
          'This gateway has no GET /v1/gates yet. Standing rules still work on the Mac; mobile list sync ships with a future gateway release.',
      };
    }
    if (!response.ok) {
      const text = await response.text();
      return {
        rules: [],
        endpoint,
        unavailableReason: text.trim() || `Gateway returned HTTP ${response.status}.`,
      };
    }
    const payload = (await response.json()) as unknown;
    return { rules: parseGateRulesPayload(payload), endpoint };
  } catch (error) {
    return {
      rules: [],
      endpoint,
      unavailableReason: error instanceof Error ? error.message : 'Could not reach gateway.',
    };
  }
}

export async function updateGateRuleDecision(
  gatewayUrl: string,
  ruleId: string,
  decision: GateRuleDecision,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(
    `${base(gatewayUrl)}${GATE_RULES_ENDPOINT}/${encodeURIComponent(ruleId)}`,
    {
      method: 'PATCH',
      headers: {
        ...buildAuthHeaders(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.trim() || `HTTP ${response.status}`);
  }
}

export async function deleteGateRule(
  gatewayUrl: string,
  ruleId: string,
  apiKey?: string | null,
): Promise<void> {
  const response = await fetch(
    `${base(gatewayUrl)}${GATE_RULES_ENDPOINT}/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
      headers: buildAuthHeaders(apiKey),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.trim() || `HTTP ${response.status}`);
  }
}
