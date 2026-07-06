import type { GateRule, GateRuleDecision } from '../types/gateRule';

function normalizeDecision(value: unknown): GateRuleDecision {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'allow' || raw === 'allowed' || raw === 'approve') {
    return 'allow';
  }
  return 'block';
}

function coerceRule(raw: Record<string, unknown>, index: number): GateRule | null {
  const id = String(raw.id ?? raw.rule_id ?? raw.key ?? '').trim();
  const pattern = String(
    raw.pattern ?? raw.command ?? raw.match ?? raw.tool_input ?? raw.reason ?? '',
  ).trim();
  if (!id && !pattern) {
    return null;
  }
  return {
    id: id || `rule-${index}`,
    pattern: pattern || id,
    toolName: typeof raw.tool_name === 'string' ? raw.tool_name : typeof raw.toolName === 'string' ? raw.toolName : undefined,
    decision: normalizeDecision(raw.decision ?? raw.action ?? raw.verdict),
    scope:
      raw.scope === 'session' || raw.scope === 'always'
        ? raw.scope
        : raw.permanent === true || raw.allow_permanent === true
          ? 'always'
          : undefined,
    createdAt:
      typeof raw.created_at === 'string'
        ? raw.created_at
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
}

/** Parse gateway `/v1/gates` payloads — supports `{ rules }`, `{ gates }`, or bare arrays. */
export function parseGateRulesPayload(payload: unknown): GateRule[] {
  if (!payload) {
    return [];
  }
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.rules)) {
      list = record.rules;
    } else if (Array.isArray(record.gates)) {
      list = record.gates;
    } else if (Array.isArray(record.items)) {
      list = record.items;
    }
  }
  return list
    .map((item, index) =>
      item && typeof item === 'object' ? coerceRule(item as Record<string, unknown>, index) : null,
    )
    .filter((rule): rule is GateRule => rule !== null);
}
