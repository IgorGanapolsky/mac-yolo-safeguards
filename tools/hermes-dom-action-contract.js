#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = 'hermes-dom-action-contract/v1';

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'textarea', 'select', 'summary']);
const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'option',
  'radio',
  'searchbox',
  'switch',
  'tab',
  'textbox',
]);

const SAFE_ATTRIBUTES = [
  'aria-label',
  'data-testid',
  'disabled',
  'href',
  'id',
  'name',
  'placeholder',
  'role',
  'title',
  'type',
];

const SENSITIVE_FIELD_RE = /password|passwd|passcode|secret|token|api[-_ ]?key|auth|otp|2fa|mfa|ssn|social|card|cc-|credit|cvv|cvc/i;
const MONEY_RE = /pay|checkout|purchase|buy|subscribe|transfer|invoice|billing|stripe|bank|card/i;
const DESTRUCTIVE_RE = /delete|remove|destroy|drop|wipe|refund|cancel|ban|revoke|disable|terminate/i;
const SUBMIT_RE = /submit|send|publish|post|approve|confirm|save|continue|sign in|log in|login/i;
const TRACKING_PARAM_RE = /^(token|key|secret|auth|code|session|sid|password|pass|signature|sig|jwt|access_token|refresh_token)$/i;

function parseAttributes(fragment) {
  const attrs = {};
  const source = String(fragment || '').replace(/^<[^ \t\r\n>]+/, '').replace(/\/?>\s*$/, '');
  const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = attrRe.exec(source)) !== null) {
    const key = match[1].toLowerCase();
    attrs[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function cleanText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value, max = 120) {
  const text = normalizeWhitespace(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function isInteractive(tag, attrs) {
  if (INTERACTIVE_TAGS.has(tag)) return true;
  if (attrs.role && INTERACTIVE_ROLES.has(String(attrs.role).toLowerCase())) return true;
  if (String(attrs.contenteditable || '').toLowerCase() === 'true') return true;
  if (attrs.onclick != null || attrs.tabindex != null) return true;
  return false;
}

function isHidden(tag, attrs) {
  if (String(attrs.type || '').toLowerCase() === 'hidden') return true;
  if (String(attrs.hidden || '').toLowerCase() === 'true' || attrs.hidden === '') return true;
  if (String(attrs['aria-hidden'] || '').toLowerCase() === 'true') return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(String(attrs.style || ''))) return true;
  return tag === 'input' && String(attrs.type || '').toLowerCase() === 'file';
}

function fieldFingerprint(tag, attrs, label) {
  return [
    tag,
    attrs.type,
    attrs.name,
    attrs.id,
    attrs.placeholder,
    attrs['aria-label'],
    attrs.title,
    label,
  ].filter(Boolean).join(' ');
}

function isSensitiveElement(tag, attrs, label) {
  if (tag === 'input' && String(attrs.type || '').toLowerCase() === 'password') return true;
  return SENSITIVE_FIELD_RE.test(fieldFingerprint(tag, attrs, label));
}

function safeHref(href) {
  if (!href) return '';
  try {
    const parsed = new URL(href, 'https://hermes.local');
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM_RE.test(key)) parsed.searchParams.set(key, '<redacted>');
    }
    if (parsed.origin === 'https://hermes.local') {
      return `${parsed.pathname}${parsed.search}${parsed.hash ? '#...' : ''}`;
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash ? '#...' : ''}`;
  } catch (_) {
    return String(href).replace(/([?&][^=]*(token|key|secret|auth|code|sid|session)[^=]*=)[^&#]+/gi, '$1<redacted>');
  }
}

function safeAttributes(tag, attrs, label) {
  const sensitive = isSensitiveElement(tag, attrs, label);
  const out = {};
  for (const key of SAFE_ATTRIBUTES) {
    if (attrs[key] == null || attrs[key] === '') continue;
    if (key === 'href') out[key] = safeHref(attrs[key]);
    else out[key] = truncate(attrs[key], 80);
  }
  if (attrs.value != null && attrs.value !== '') {
    out.value = '<redacted>';
    out.hasValue = true;
  }
  if (sensitive) out.sensitive = true;
  return out;
}

function labelFor(tag, attrs, innerHtml) {
  return truncate(
    attrs['aria-label'] ||
    attrs.title ||
    attrs.alt ||
    cleanText(innerHtml) ||
    attrs.placeholder ||
    attrs.name ||
    attrs.id ||
    attrs.value ||
    tag,
  );
}

function collectRisks(tag, attrs, label, options = {}) {
  const haystack = fieldFingerprint(tag, attrs, label);
  const risks = [];
  if (isSensitiveElement(tag, attrs, label)) risks.push('credential');
  if (tag === 'input' || tag === 'textarea' || attrs.role === 'textbox' || attrs.contenteditable === 'true') risks.push('text_entry');
  if (tag === 'button' && String(attrs.type || '').toLowerCase() === 'submit') risks.push('submit');
  if (SUBMIT_RE.test(haystack)) risks.push('submit');
  if (MONEY_RE.test(haystack)) risks.push('money');
  if (DESTRUCTIVE_RE.test(haystack)) risks.push('destructive');
  if (tag === 'a' && attrs.href && /^https?:\/\//i.test(attrs.href)) {
    try {
      const hrefOrigin = new URL(attrs.href).origin;
      if (!options.allowedOrigins || !options.allowedOrigins.includes(hrefOrigin)) risks.push('external_navigation');
    } catch (_) {
      risks.push('external_navigation');
    }
  }
  return [...new Set(risks)];
}

function dehydrateHtml(html, options = {}) {
  const elements = [];
  const seen = new Set();
  const allowedOrigins = options.allowedOrigins || [];

  function addElement(tag, attrsText, innerHtml, index) {
    const normalizedTag = tag.toLowerCase();
    const attrs = parseAttributes(`<${normalizedTag}${attrsText || ''}>`);
    if (!isInteractive(normalizedTag, attrs) || isHidden(normalizedTag, attrs)) return;

    const label = labelFor(normalizedTag, attrs, innerHtml);
    const key = `${normalizedTag}:${index}:${attrs.id || ''}:${attrs.name || ''}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);

    const risks = collectRisks(normalizedTag, attrs, label, { allowedOrigins });
    const element = {
      index: elements.length + 1,
      handle: `h${elements.length + 1}`,
      tag: normalizedTag,
      role: attrs.role || inferredRole(normalizedTag, attrs),
      label,
      text: cleanText(innerHtml),
      attributes: safeAttributes(normalizedTag, attrs, label),
      risks,
      disabled: attrs.disabled != null || String(attrs['aria-disabled'] || '').toLowerCase() === 'true',
    };
    elements.push(element);
  }

  const pairedRe = /<(a|button|textarea|select|summary)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pairedRe.exec(String(html || ''))) !== null) {
    addElement(match[1], match[2], match[3], match.index);
  }

  const inputRe = /<input\b([^>]*)\/?>/gi;
  while ((match = inputRe.exec(String(html || ''))) !== null) {
    addElement('input', match[1], '', match.index);
  }

  const roleRe = /<([a-z][\w:-]*)([^>]*(?:role\s*=|contenteditable\s*=|onclick\b|tabindex\s*=)[^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((match = roleRe.exec(String(html || ''))) !== null) {
    addElement(match[1], match[2], match[3], match.index);
  }

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    title: options.title || '',
    url: options.url || '',
    elementCount: elements.length,
    elements: elements.slice(0, options.maxElements || 80),
    limits: {
      maxElements: options.maxElements || 80,
      valuePolicy: 'values are never exposed; non-empty values become <redacted>',
    },
  };
}

function inferredRole(tag, attrs) {
  if (attrs.role) return attrs.role;
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input') {
    const type = String(attrs.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return type;
    return 'textbox';
  }
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  return tag;
}

function tokenize(value) {
  return normalizeWhitespace(value).toLowerCase().split(/[^a-z0-9@._-]+/).filter(Boolean);
}

function commandIntent(command) {
  const raw = normalizeWhitespace(command);
  const lower = raw.toLowerCase();
  if (/^(scroll|page)\b/.test(lower)) {
    return { action: 'scroll', direction: /up/.test(lower) ? 'up' : 'down', targetText: '' };
  }

  const quotedInput = raw.match(/^(?:type|enter|fill|set)\s+["']([^"']+)["']\s+(?:into|in|on|for)\s+(?:the\s+)?(.+)$/i);
  const looseInput = raw.match(/^(?:type|enter|fill|set)\s+(.+?)\s+(?:into|in|on|for)\s+(?:the\s+)?(.+)$/i);
  const inputMatch = quotedInput || looseInput;
  if (inputMatch) {
    return {
      action: 'input',
      value: inputMatch[1],
      targetText: cleanupTarget(inputMatch[2]),
    };
  }

  const clickMatch = raw.match(/^(?:click|tap|press|open|choose|select)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
  if (clickMatch) return { action: 'click', targetText: cleanupTarget(clickMatch[1]) };

  return { action: 'unknown', targetText: cleanupTarget(raw) };
}

function cleanupTarget(target) {
  return normalizeWhitespace(target)
    .replace(/\b(button|link|input|field|textbox|tab|menu|icon|dropdown|select|box)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreElement(targetText, element) {
  const target = normalizeWhitespace(targetText).toLowerCase();
  if (!target) return 0;
  const label = normalizeWhitespace([
    element.label,
    element.text,
    element.attributes.id,
    element.attributes.name,
    element.attributes.placeholder,
    element.attributes['aria-label'],
    element.attributes.role,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (!label) return 0;
  if (label === target) return 100;
  if (label.includes(target)) return 85;
  if (target.includes(label) && label.length > 2) return 70;
  const targetTokens = tokenize(target);
  const labelTokens = new Set(tokenize(label));
  const hits = targetTokens.filter((token) => labelTokens.has(token)).length;
  return hits ? 30 + hits * 10 : 0;
}

function approvalReasons(risks, options = {}) {
  const allowed = new Set(options.allowedRisks || []);
  return risks
    .filter((risk) => !allowed.has(risk))
    .filter((risk) => ['credential', 'destructive', 'money', 'submit', 'external_navigation'].includes(risk));
}

function buildActionPlan(command, dehydrated, options = {}) {
  const intent = commandIntent(command);
  if (intent.action === 'scroll') {
    return {
      ok: true,
      command,
      action: 'scroll',
      direction: intent.direction,
      requiresApproval: false,
      risks: [],
      sideEffects: ['viewport_change'],
    };
  }
  if (intent.action === 'unknown') {
    return {
      ok: false,
      command,
      action: 'unknown',
      reason: 'unsupported_command',
      requiresApproval: false,
    };
  }

  const candidates = (dehydrated.elements || [])
    .filter((element) => !element.disabled)
    .filter((element) => intent.action !== 'input' || ['input', 'textarea'].includes(element.tag) || element.role === 'textbox')
    .map((element) => ({ element, score: scoreElement(intent.targetText, element) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.element.index - b.element.index);

  if (!candidates.length) {
    return {
      ok: false,
      command,
      action: intent.action,
      targetText: intent.targetText,
      reason: 'target_not_found',
      requiresApproval: false,
    };
  }

  const target = candidates[0].element;
  const risks = [...new Set([...(target.risks || []), ...(intent.action === 'input' ? ['text_entry'] : [])])];
  const blockedReasons = approvalReasons(risks, options);
  return {
    ok: true,
    command,
    action: intent.action,
    target: {
      index: target.index,
      handle: target.handle,
      tag: target.tag,
      role: target.role,
      label: target.label,
      attributes: actionDescriptorAttributes(target.attributes),
    },
    value: intent.action === 'input' ? intent.value : undefined,
    valuePolicy: intent.action === 'input' ? 'not logged in result; only injected into the page action' : undefined,
    risks,
    requiresApproval: blockedReasons.length > 0,
    approvalReasons: blockedReasons,
    matchScore: candidates[0].score,
    sideEffects: sideEffectsFor(intent.action, risks),
  };
}

function actionDescriptorAttributes(attrs = {}) {
  const keys = ['id', 'name', 'placeholder', 'href', 'type', 'role', 'data-testid', 'aria-label', 'title'];
  const out = {};
  for (const key of keys) {
    if (attrs[key]) out[key] = attrs[key];
  }
  return out;
}

function sideEffectsFor(action, risks) {
  const effects = [];
  if (action === 'input') effects.push('form_value_change');
  if (action === 'click') effects.push('click_event');
  if (risks.includes('submit')) effects.push('possible_submit');
  if (risks.includes('external_navigation')) effects.push('possible_navigation');
  if (risks.includes('money')) effects.push('possible_payment');
  if (risks.includes('destructive')) effects.push('possible_destructive_change');
  return [...new Set(effects)];
}

function generateInPageJavaScript(plan, options = {}) {
  if (!plan || !plan.ok) {
    return '(() => ({ ok: false, reason: "no_action_plan" }))();';
  }
  if (plan.requiresApproval && !options.approved) {
    return `(() => (${JSON.stringify({
      ok: false,
      reason: 'approval_required',
      approvalReasons: plan.approvalReasons || [],
      sideEffects: plan.sideEffects || [],
    })}))();`;
  }
  if (plan.action === 'scroll') {
    const distance = plan.direction === 'up' ? '-window.innerHeight * 0.85' : 'window.innerHeight * 0.85';
    return `(() => { window.scrollBy({ top: ${distance}, behavior: "smooth" }); return { ok: true, action: "scroll", direction: ${JSON.stringify(plan.direction)} }; })();`;
  }

  const descriptor = JSON.stringify(plan.target || {});
  const value = JSON.stringify(plan.value || '');
  const action = JSON.stringify(plan.action);
  return `(() => {
  const descriptor = ${descriptor};
  const action = ${action};
  const value = ${value};
  const matches = (el) => {
    const attrs = descriptor.attributes || {};
    const attr = (name) => el.getAttribute(name) || "";
    if (attrs.id && attr("id") !== attrs.id) return false;
    if (attrs.name && attr("name") !== attrs.name) return false;
    if (attrs.placeholder && attr("placeholder") !== attrs.placeholder) return false;
    if (attrs.href && attr("href") !== attrs.href) return false;
    if (attrs["data-testid"] && attr("data-testid") !== attrs["data-testid"]) return false;
    if (attrs["aria-label"] && attr("aria-label") !== attrs["aria-label"]) return false;
    if (attrs.title && attr("title") !== attrs.title) return false;
    return true;
  };
  const candidates = Array.from(document.querySelectorAll(descriptor.tag || "*"));
  const el = candidates.find(matches) || candidates.find((candidate) => {
    const label = [
      candidate.getAttribute("aria-label"),
      candidate.getAttribute("title"),
      candidate.getAttribute("placeholder"),
      candidate.textContent,
    ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
    return label === descriptor.label;
  });
  if (!el) return { ok: false, reason: "target_not_found", action, target: descriptor.label };
  el.scrollIntoView({ block: "center", inline: "nearest" });
  if (action === "input") {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, action, target: descriptor.label, valueWritten: true };
  }
  el.focus?.({ preventScroll: true });
  el.click();
  return { ok: true, action, target: descriptor.label };
})();`;
}

function buildBrief(command, html, options = {}) {
  const dom = dehydrateHtml(html, options);
  const plan = command ? buildActionPlan(command, dom, options) : null;
  return {
    generatedAt: new Date().toISOString(),
    source: 'page-agent-inspired-dom-contract',
    upstreamPattern: {
      name: 'Alibaba Page Agent',
      url: 'https://github.com/alibaba/page-agent',
      adaptedIdeas: ['DOM dehydration', 'indexed interactive elements', 'in-page action execution'],
      notAdoptedByDefault: ['demo LLM endpoint', 'always-on Chrome extension', 'ungated submit/payment actions'],
    },
    dom,
    plan,
    javascript: plan ? generateInPageJavaScript(plan, options) : undefined,
  };
}

function parseArgs(argv) {
  const args = { command: '', file: '', natural: '', json: false, approved: false, allowedRisks: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!args.command) args.command = arg;
    else if (!args.file) args.file = arg;
    else if (!args.natural && !arg.startsWith('--')) args.natural = arg;
    else if (arg === '--json') args.json = true;
    else if (arg === '--approved') args.approved = true;
    else if (arg === '--allow-risk') args.allowedRisks.push(requireValue(argv, ++i, arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function usage() {
  return `Usage:
  node tools/hermes-dom-action-contract.js dehydrate <html-file> [--json]
  node tools/hermes-dom-action-contract.js plan <html-file> "Click Log In" [--json] [--allow-risk submit]
  node tools/hermes-dom-action-contract.js inject <html-file> "Type value in Email" [--approved]

This tool is dependency-free and read-only except for printing a planned in-page JavaScript action.
It masks form values and gates risky submit/payment/destructive/credential actions by default.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.command || args.command === '--help' || args.command === '-h') {
    console.log(usage());
    return 0;
  }
  if (!args.file) throw new Error(`${args.command} requires an HTML file`);
  const html = fs.readFileSync(path.resolve(args.file), 'utf8');
  if (args.command === 'dehydrate') {
    console.log(JSON.stringify(dehydrateHtml(html), null, 2));
    return 0;
  }
  if (args.command === 'plan' || args.command === 'inject') {
    if (!args.natural) throw new Error(`${args.command} requires a natural-language command`);
    const dom = dehydrateHtml(html);
    const plan = buildActionPlan(args.natural, dom, { allowedRisks: args.allowedRisks });
    if (args.command === 'plan') console.log(JSON.stringify(plan, null, 2));
    else console.log(generateInPageJavaScript(plan, { approved: args.approved }));
    return plan.ok ? 0 : 2;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION,
  buildActionPlan,
  buildBrief,
  cleanText,
  dehydrateHtml,
  generateInPageJavaScript,
  parseArgs,
  parseAttributes,
  safeHref,
};
