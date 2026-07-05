#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const VERSION = 'leash-openclaw-gate-contract/v1';

const EFFECTS = new Set(['allow', 'ask', 'block']);
const SCOPES = new Set([
  'browser',
  'chat',
  'file',
  'message',
  'network',
  'openclaw',
  'payment',
  'shell',
  'tool',
]);

const HIGH_RISK_RE = /credential|secret|token|api[-_ ]?key|password|otp|2fa|mfa|ssn|card|cvv|exfil/i;
const MONEY_RE = /pay|payment|purchase|checkout|transfer|invoice|billing|bank|card|stripe|subscribe/i;
const DESTRUCTIVE_RE = /delete|remove|destroy|drop|wipe|refund|cancel|ban|revoke|disable|terminate|rm\s+-rf|mkfs|dd\s+if=/i;
const SUBMIT_RE = /submit|send|publish|post|approve|confirm|save|continue|sign in|login|log in/i;
const READ_ONLY_RE = /read|list|status|inspect|view|show|ls|pwd|git status|cat docs|health/i;

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  const slug = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'gate';
}

function stableId(prefix, value) {
  const digest = crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 10);
  return `${prefix}-${slugify(value).slice(0, 42) || digest}-${digest}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function inferScope(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  for (const scope of SCOPES) {
    if (text.includes(scope)) return scope;
  }
  if (/http|url|fetch|curl|post|api/.test(text)) return 'network';
  if (/file|path|\.env|directory|write|read/.test(text)) return 'file';
  if (/shell|terminal|bash|zsh|sudo|rm\s+-rf|chmod|git/.test(text)) return 'shell';
  if (MONEY_RE.test(text)) return 'payment';
  if (/page|dom|click|input|button|browser|external_navigation/.test(text)) return 'browser';
  return 'openclaw';
}

function inferEffect(value, fallback = 'ask') {
  const text = normalizeWhitespace(value);
  if (/^allow\b|allowlist|safe|read[-_ ]?only/i.test(text)) return 'allow';
  if (/^block\b|deny|forbid|never|credential|secret|exfil|rm\s+-rf|mkfs|dd\s+if=/i.test(text)) return 'block';
  if (/^ask\b|approve|review|confirm|approval/i.test(text)) return 'ask';
  if (HIGH_RISK_RE.test(text) || DESTRUCTIVE_RE.test(text)) return 'block';
  if (MONEY_RE.test(text) || SUBMIT_RE.test(text)) return 'ask';
  if (READ_ONLY_RE.test(text)) return 'allow';
  return fallback;
}

function riskTagsFor(value) {
  const text = normalizeWhitespace(value);
  const tags = [];
  if (HIGH_RISK_RE.test(text)) tags.push('credential_or_secret');
  if (MONEY_RE.test(text)) tags.push('money_movement');
  if (DESTRUCTIVE_RE.test(text)) tags.push('destructive');
  if (SUBMIT_RE.test(text)) tags.push('submit_or_send');
  if (/external_navigation|external|cross[-_ ]?site|http/i.test(text)) tags.push('external_navigation');
  if (READ_ONLY_RE.test(text)) tags.push('read_only');
  return [...new Set(tags)];
}

function normalizeEffect(effect, matcher) {
  const normalized = normalizeWhitespace(effect).toLowerCase();
  if (EFFECTS.has(normalized)) return normalized;
  return inferEffect(matcher);
}

function normalizeScope(scope, matcher) {
  const normalized = normalizeWhitespace(scope).toLowerCase();
  if (SCOPES.has(normalized)) return normalized;
  return inferScope(`${scope || ''} ${matcher || ''}`);
}

function normalizeGate(raw, index = 0, source = 'openclaw') {
  const matcher = normalizeWhitespace(raw.matcher || raw.pattern || raw.command || raw.intent || raw.name || raw.title || raw.id || raw);
  const effect = normalizeEffect(raw.effect || raw.action || raw.decision || raw.kind, matcher);
  const scope = normalizeScope(raw.scope || raw.surface || raw.tool, matcher);
  const title = normalizeWhitespace(raw.title || raw.name || `${effect} ${scope} ${matcher}`).slice(0, 96);
  const tier = raw.tier === 'free' || raw.free === true ? 'free' : 'pro';
  const id = normalizeWhitespace(raw.id) || stableId(`openclaw-${effect}`, `${source}:${scope}:${matcher}:${index}`);
  const isStandingRule = raw.standingRule !== false && !raw.freeAction;

  return {
    id,
    version: 1,
    title,
    effect,
    scope,
    source: raw.source || source,
    tier,
    matcher,
    risks: raw.risks || riskTagsFor(`${scope} ${matcher} ${title}`),
    rationale: normalizeWhitespace(raw.rationale || raw.reason || rationaleFor(effect, scope, matcher)),
    standingRule: isStandingRule,
    editable: tier === 'pro' && isStandingRule,
    deletable: tier === 'pro' && isStandingRule,
    visibleToFree: raw.visibleToFree !== false,
  };
}

function rationaleFor(effect, scope, matcher) {
  if (effect === 'block') return `Block ${scope} actions matching "${matcher}" before execution.`;
  if (effect === 'ask') return `Ask before ${scope} actions matching "${matcher}" run.`;
  return `Allow low-risk ${scope} actions matching "${matcher}" without a standing prompt.`;
}

function defaultLeashGates() {
  return clone([
    {
      id: 'free-chat-approve-deny',
      version: 1,
      title: 'Chat approve and deny decisions',
      effect: 'allow',
      scope: 'chat',
      source: 'hermes',
      tier: 'free',
      matcher: 'approve|deny|reject pending chat action',
      risks: ['human_in_loop'],
      rationale: 'Basic approve/deny actions stay free so Leash is useful before upgrade.',
      standingRule: false,
      editable: false,
      deletable: false,
      visibleToFree: true,
    },
    {
      id: 'free-thumbgate-chat-feedback',
      version: 1,
      title: 'ThumbGate chat thumbs feedback',
      effect: 'allow',
      scope: 'chat',
      source: 'thumbgate',
      tier: 'free',
      matcher: 'thumbs up|thumbs down|chat feedback',
      risks: ['feedback_only'],
      rationale: 'ThumbGate feedback remains in chat and is not part of the paid gate editor.',
      standingRule: false,
      editable: false,
      deletable: false,
      visibleToFree: true,
    },
    normalizeGate({
      id: 'openclaw-ask-submit-money-external',
      title: 'Ask before OpenClaw submits, pays, sends, or leaves site',
      effect: 'ask',
      scope: 'openclaw',
      matcher: 'submit|send|purchase|payment|approve|external_navigation',
      risks: ['submit_or_send', 'money_movement', 'external_navigation'],
      rationale: 'Autonomous GUI agents need a paid, inspectable standing gate before high-impact actions.',
    }, 0, 'openclaw'),
    normalizeGate({
      id: 'openclaw-block-secret-exfiltration',
      title: 'Block credential or secret exfiltration',
      effect: 'block',
      scope: 'network',
      matcher: 'credential|secret|token|api key|.env|Authorization header exfiltration',
      risks: ['credential_or_secret'],
      rationale: 'Secrets must be blocked before a tool call or browser automation leaves the device.',
    }, 1, 'openclaw'),
    normalizeGate({
      id: 'leash-allow-readonly-status',
      title: 'Allow read-only local status checks',
      effect: 'allow',
      scope: 'tool',
      matcher: 'status|list|inspect|health|pwd|git status|cat docs',
      risks: ['read_only'],
      rationale: 'Low-risk read-only operations should not make the app feel blocked.',
    }, 2, 'hermes'),
  ]);
}

function parseLooseJson(input) {
  if (typeof input !== 'string') return input || {};
  const text = input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
  if (!text) return {};
  return JSON.parse(text);
}

function collectPolicyEntries(policy) {
  const parsed = parseLooseJson(policy);
  const entries = [];

  function add(effect, scope, item, source = 'openclaw') {
    if (item == null) return;
    if (Array.isArray(item)) {
      item.forEach((child) => add(effect, scope, child, source));
      return;
    }
    if (typeof item === 'object') {
      entries.push({ ...item, effect: item.effect || effect, scope: item.scope || scope, source: item.source || source });
      return;
    }
    entries.push({ effect, scope, matcher: String(item), source });
  }

  add(undefined, undefined, parsed.rules || parsed.gates || parsed.policies, parsed.source || 'openclaw');
  add('allow', undefined, parsed.allow || parsed.allows || parsed.allowlist || parsed.allowed, parsed.source || 'openclaw');
  add('block', undefined, parsed.block || parsed.blocks || parsed.blocklist || parsed.denied, parsed.source || 'openclaw');
  add('ask', undefined, parsed.ask || parsed.asks || parsed.approvals || parsed.requireApproval || parsed.requiresApproval, parsed.source || 'openclaw');

  if (parsed.tools && typeof parsed.tools === 'object') {
    for (const [tool, config] of Object.entries(parsed.tools)) {
      if (Array.isArray(config)) add(undefined, tool, config, 'openclaw');
      else if (config && typeof config === 'object') {
        add('allow', tool, config.allow || config.allows || config.allowed, 'openclaw');
        add('ask', tool, config.ask || config.approvals || config.requireApproval || config.requiresApproval, 'openclaw');
        add('block', tool, config.block || config.blocks || config.denied, 'openclaw');
      }
    }
  }

  if (parsed.openclaw && parsed.openclaw !== parsed) {
    entries.push(...collectPolicyEntries({ ...parsed.openclaw, source: 'openclaw' }));
  }

  return entries;
}

function openClawPolicyToLeashGates(policy) {
  return collectPolicyEntries(policy)
    .filter((entry) => normalizeWhitespace(entry.matcher || entry.pattern || entry.command || entry.intent || entry.name || entry.title || entry.id))
    .map((entry, index) => normalizeGate(entry, index, entry.source || 'openclaw'));
}

function capabilitiesForTier(tier) {
  const pro = tier === 'pro';
  return {
    tier: pro ? 'pro' : 'free',
    canApprovePendingChatActions: true,
    canDenyPendingChatActions: true,
    canSendThumbgateFeedbackInChat: true,
    canViewStandingGateSummary: true,
    canViewAllStandingGates: pro,
    canCreateStandingGates: pro,
    canEditStandingGates: pro,
    canDeleteStandingGates: pro,
    canImportOpenClawPolicy: pro,
  };
}

function summarizeGates(gates) {
  const summary = {
    total: gates.length,
    allow: 0,
    ask: 0,
    block: 0,
    proManaged: 0,
    freeActions: 0,
    openclaw: 0,
  };
  for (const gate of gates) {
    if (summary[gate.effect] != null) summary[gate.effect] += 1;
    if (gate.tier === 'pro' && gate.standingRule) summary.proManaged += 1;
    if (gate.tier === 'free' || gate.standingRule === false) summary.freeActions += 1;
    if (gate.source === 'openclaw') summary.openclaw += 1;
  }
  return summary;
}

function buildGateContract(options = {}) {
  const imported = options.openClawPolicy ? openClawPolicyToLeashGates(options.openClawPolicy) : [];
  const gates = [...defaultLeashGates(), ...imported];
  const tier = options.tier === 'pro' ? 'pro' : 'free';
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    tier,
    capabilities: capabilitiesForTier(tier),
    summary: summarizeGates(gates),
    gates,
    monetizationBoundary: {
      free: [
        'approve/deny a pending chat action',
        'send ThumbGate thumbs up/down feedback in chat',
        'see that standing gates exist',
      ],
      pro: [
        'view every standing allow/ask/block gate',
        'create, edit, and delete standing gates',
        'import OpenClaw policy/risk rules',
      ],
    },
    thumbgateContract: {
      location: 'chat',
      paidFeature: false,
      gateEditorSurface: false,
    },
  };
}

function validateGateContract(contract) {
  const errors = [];
  const gates = Array.isArray(contract.gates) ? contract.gates : [];
  const ids = new Set();

  for (const gate of gates) {
    if (!gate.id) errors.push('gate missing id');
    if (gate.id && ids.has(gate.id)) errors.push(`duplicate gate id: ${gate.id}`);
    if (gate.id) ids.add(gate.id);
    if (!EFFECTS.has(gate.effect)) errors.push(`invalid effect for ${gate.id || '<unknown>'}: ${gate.effect}`);
    if (!SCOPES.has(gate.scope)) errors.push(`invalid scope for ${gate.id || '<unknown>'}: ${gate.scope}`);
    if (gate.tier === 'pro' && gate.standingRule !== false && (!gate.editable || !gate.deletable)) {
      errors.push(`pro standing gate must be editable and deletable: ${gate.id}`);
    }
  }

  const freeChat = gates.find((gate) => gate.id === 'free-chat-approve-deny');
  if (!freeChat || freeChat.tier !== 'free' || freeChat.effect !== 'allow' || freeChat.editable || freeChat.deletable) {
    errors.push('free chat approve/deny contract is missing or incorrectly gated');
  }

  const thumbgate = gates.find((gate) => gate.id === 'free-thumbgate-chat-feedback');
  if (!thumbgate || thumbgate.tier !== 'free' || thumbgate.source !== 'thumbgate' || thumbgate.standingRule !== false) {
    errors.push('ThumbGate chat feedback must remain free and outside standing gate management');
  }

  const capabilities = contract.capabilities || {};
  if (!capabilities.canApprovePendingChatActions || !capabilities.canDenyPendingChatActions || !capabilities.canSendThumbgateFeedbackInChat) {
    errors.push('free core Leash actions are not enabled in capabilities');
  }

  return { ok: errors.length === 0, errors };
}

function matchesGate(intent, gate) {
  const text = normalizeWhitespace(intent).toLowerCase();
  const matcher = normalizeWhitespace(gate.matcher).toLowerCase();
  if (!matcher) return false;
  const alternatives = matcher.split('|').map((part) => normalizeWhitespace(part).toLowerCase()).filter(Boolean);
  if (alternatives.some((part) => text.includes(part))) return true;
  const matcherWords = matcher.split(/[^a-z0-9._-]+/).filter((word) => word.length > 2);
  return matcherWords.length > 0 && matcherWords.some((word) => text.includes(word));
}

function evaluateIntentAgainstGates(intent, gates = defaultLeashGates()) {
  const normalizedIntent = normalizeWhitespace(intent);
  const inferred = {
    effect: inferEffect(normalizedIntent, 'allow'),
    scope: inferScope(normalizedIntent),
    risks: riskTagsFor(normalizedIntent),
  };
  const matched = gates.filter((gate) => matchesGate(normalizedIntent, gate));
  const ranked = matched.sort((a, b) => effectRank(b.effect) - effectRank(a.effect));
  const top = ranked[0];
  const decision = top ? top.effect : inferred.effect;

  return {
    intent: normalizedIntent,
    decision,
    scope: top ? top.scope : inferred.scope,
    risks: [...new Set([...(top ? top.risks : []), ...inferred.risks])],
    matchedGateIds: ranked.map((gate) => gate.id),
    requiresApproval: decision === 'ask',
    blocked: decision === 'block',
    proManaged: ranked.some((gate) => gate.tier === 'pro' && gate.standingRule),
  };
}

function effectRank(effect) {
  if (effect === 'block') return 3;
  if (effect === 'ask') return 2;
  if (effect === 'allow') return 1;
  return 0;
}

function readPolicyArg(arg) {
  if (!arg || arg === '-') return fs.readFileSync(0, 'utf8');
  if (fs.existsSync(arg)) return fs.readFileSync(arg, 'utf8');
  return arg;
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'defaults';
  if (command === 'defaults') {
    const tier = argv.includes('--pro') ? 'pro' : 'free';
    const contract = buildGateContract({ tier });
    console.log(JSON.stringify(contract, null, argv.includes('--json') ? 2 : 0));
    return;
  }
  if (command === 'from-policy') {
    const policyArg = argv[1] || '-';
    const tier = argv.includes('--free') ? 'free' : 'pro';
    const contract = buildGateContract({ tier, openClawPolicy: readPolicyArg(policyArg) });
    console.log(JSON.stringify(contract, null, 2));
    return;
  }
  if (command === 'evaluate') {
    const intent = argv.slice(1).join(' ');
    const result = evaluateIntentAgainstGates(intent, defaultLeashGates());
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'validate') {
    const contract = buildGateContract({ tier: argv.includes('--free') ? 'free' : 'pro' });
    const result = validateGateContract(contract);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  console.error('Usage: leash-openclaw-gate-contract.js [defaults|from-policy|evaluate|validate]');
  process.exitCode = 2;
}

module.exports = {
  VERSION,
  buildGateContract,
  capabilitiesForTier,
  collectPolicyEntries,
  defaultLeashGates,
  evaluateIntentAgainstGates,
  normalizeGate,
  openClawPolicyToLeashGates,
  parseLooseJson,
  summarizeGates,
  validateGateContract,
};

if (require.main === module) {
  main();
}
