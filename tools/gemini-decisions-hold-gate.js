#!/usr/bin/env node
'use strict';

/**
 * Hold a Mac YOLO offer for a freeze complaint.
 * Source: https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/
 *
 * Google's latency and price figures stay Google's.
 * This file does not call the Decisions API, send mail, or open a checkout.
 */

const SOURCE = 'https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/';

const OFFERS = {
  pro: {
    id: 'pro_guard',
    label: 'Mac YOLO Pro Guard',
    path: '/go/pro',
    url: 'https://macyolosafeguards.io/go/pro',
  },
  diagnostic: {
    id: 'diagnostic',
    label: 'Agent Reliability Diagnostic',
    path: '/go/diagnostic',
    url: 'https://macyolosafeguards.io/go/diagnostic',
  },
  sprint: {
    id: 'sprint',
    label: 'AI Agent Hardening Sprint',
    path: '/go/sprint',
    url: 'https://macyolosafeguards.io/go/sprint',
  },
};

const REMOTE = /generativelanguage\.googleapis\.com|gemini-decision-1|GEMINI_API_KEY|v1beta\/decisions/i;
const VENDOR_FIGURE = /150\s*[-–]\s*250\s*ms|\$0\.10|5\s*x\s*cheaper|40\s*%\s*lower\s*latency/i;
const SEND_OR_CHARGE = /\b(send (the |an |a )?(e-?mail|mail|message)|e-?mail (the |a |our )?(buyer|customer|lead|prospect)|open checkout|buy\.stripe\.com|checkout\.stripe\.com|create a charge|charge the card)\b/i;
const FREEZE = /\b(freez\w*|froze\w*|swap|ram|memory pressure|fans?|disk full|filled the disk|out of disk|out of memory)\b/i;
const AGENT = /\b(claude code|cursor|codex|agent)\b/i;
const MAC = /\b(macs?|macos|apple silicon)\b/i;
const DIAGNOSE = /\b(diagnos\w*|audit|what(?:'s| is) wrong)\b/i;
const SPRINT = /\b(team|our macs|sprint|fleet|(?:\d+|two|three|four|five|six|seven|eight|nine|ten|several|multiple|many|a few) macs)\b/i;
const PRO_GUARD = /\bpro guard\b/i;
const NON_MAC = /\b(windows|linux|ubuntu|chromebook|chromeos|wsl)\b/i;
const PILOT = /\bpartner pilot\b/i;
const OTHER_BUSINESS = /\b(broward|miami-dade|palm beach|tax[- ]deeds?|foreclosures?|real[- ]estate)\b/i;
const ATTRIBUTED = /\bgoogle(?:'s)?\b/i;

// A vendor figure counts as attributed only when the attribution sits next to it in the same text.
function unattributedFigure(segments) {
  for (const segment of segments) {
    const text = String(segment || '');
    const re = new RegExp(VENDOR_FIGURE.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const around = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      if (!ATTRIBUTED.test(around)) return true;
    }
  }
  return false;
}

function finding(id) {
  return { id, severity: 'block' };
}

function macFreezeSignal(text) {
  const value = String(text || '');
  // A complaint that names another platform and no Mac is not a Mac freeze.
  if (NON_MAC.test(value) && !MAC.test(value)) return false;
  return FREEZE.test(value) && (AGENT.test(value) || MAC.test(value));
}

function pickOffer(text) {
  if (PILOT.test(text)) return null;
  const diagnose = DIAGNOSE.test(text);
  const sprint = SPRINT.test(text);
  const pro = PRO_GUARD.test(text);
  // Asking for two offers at once goes to a human.
  if ([diagnose, sprint, pro].filter(Boolean).length > 1) return null;
  if (diagnose) return OFFERS.diagnostic;
  if (sprint) return OFFERS.sprint;
  return OFFERS.pro;
}

function reviewDecisionHold(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const signal = String(input.signal || '');
  const note = String(input.note || '');
  const blob = signal + '\n' + note;
  const findings = [];
  const remote = action === 'call' || REMOTE.test(blob);
  const send = action === 'send' || action === 'charge' || action === 'checkout' || SEND_OR_CHARGE.test(blob);
  const unattributed = unattributedFigure([signal, note]);

  if (remote) findings.push(finding('remote_call'));
  if (send) findings.push(finding('send_or_charge'));
  if (unattributed) findings.push(finding('vendor_figure_as_local'));
  if (OTHER_BUSINESS.test(blob)) findings.push(finding('other_business'));

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const freeze = macFreezeSignal(blob);
  let offer = null;
  let human = false;
  if (unique.length === 0 && freeze && (action === 'hold' || action === 'note' || action === 'record')) {
    const picked = pickOffer(blob);
    if (!picked) human = true;
    else offer = picked;
  }

  let status = 'clear';
  if (unique.length) status = 'blocked';
  else if (human) status = 'human';
  else if (offer) status = 'held';

  return {
    ok: unique.length === 0,
    status,
    findings: unique,
    offer: offer ? { id: offer.id, label: offer.label, path: offer.path, url: offer.url } : null,
    purchased: false,
    emailSent: false,
    remoteCall: false,
    localLatencyMs: null,
    localCostPerMillionUsd: null,
    localCheaperMultiple: null,
    localLatencyDrop: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewDecisionHold({
    action: argValue(argv, '--action') || 'note',
    signal: argValue(argv, '--signal'),
    note: argValue(argv, '--note'),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(report));
  else {
    console.log('Decision hold: ' + report.status);
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('offer: ' + (report.offer ? report.offer.path : 'none'));
    console.log('purchased: false');
    console.log('emailSent: false');
    console.log('remoteCall: false');
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  OFFERS,
  reviewDecisionHold,
};
