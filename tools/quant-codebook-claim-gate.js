#!/usr/bin/env node
'use strict';

/**
 * Fail closed on an unmeasured quant route.
 * Source post: https://x.com/shinboson/status/2120499242342985821
 *
 * The post's size, retention, and decode figures stay the author's.
 * This file does not download weights, install a library, or spend GPU time.
 */

const SOURCE = 'https://x.com/shinboson/status/2120499242342985821';

const UNMEASURED_ROUTE = /e-?means|lookatmyquant|qwen3\.5|bonsai[\s-]*2/i;
const VENDOR_FIGURE = /8\.41\s*gb|1\.23\s*gb|91\.9\s*%|110\s*tk\/s|10\s*x\s*fewer\s*epochs/i;
const SPEND = /\binstall\s+faiss\b|\bpip\s+install\b|\bnpm\s+install\b|\bcolab\b|\bdonat(?:e|ed)\s+gpu\b/i;

function unmeasuredQuantRoute(modelId) {
  return UNMEASURED_ROUTE.test(String(modelId || ''));
}

function finding(id) {
  return { id, severity: 'block' };
}

function reviewQuantClaim(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const modelId = String(input.modelId || '');
  const note = String(input.note || '');
  const findings = [];
  const figures = VENDOR_FIGURE.test(note) || VENDOR_FIGURE.test(modelId);
  const attributed = /\bauthor(?:'s|s)?\b/i.test(note);

  if (action === 'install' || SPEND.test(note)) findings.push(finding('install_or_spend'));
  if ((action === 'serve' || action === 'record') && unmeasuredQuantRoute(modelId)) {
    findings.push(finding('unmeasured_quant_route'));
  }
  if (action === 'serve' && unmeasuredQuantRoute(note)) findings.push(finding('unmeasured_quant_route'));
  if (figures && (action === 'record' || action === 'serve' || (action === 'note' && !attributed))) {
    findings.push(finding('vendor_figure_as_local'));
  }

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    ok: unique.length === 0,
    status: unique.length ? 'blocked' : 'clear',
    findings: unique,
    localBytes: null,
    localRetention: null,
    localTokensPerSecond: null,
    epochsSaved: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewQuantClaim({
    action: argValue(argv, '--action') || 'note',
    modelId: argValue(argv, '--model'),
    note: argValue(argv, '--note'),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Quant claim: clear' : 'Quant claim: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('localBytes: null');
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  unmeasuredQuantRoute,
  reviewQuantClaim,
};
