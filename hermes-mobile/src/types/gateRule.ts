export type GateRuleDecision = 'allow' | 'block';

export interface GateRule {
  id: string;
  pattern: string;
  toolName?: string;
  decision: GateRuleDecision;
  scope?: 'session' | 'always';
  createdAt?: string;
  source?: string;
}

export interface GateRulesFetchResult {
  rules: GateRule[];
  endpoint: string;
  /** Set when the gateway has no list API or the request failed. */
  unavailableReason?: string;
}
