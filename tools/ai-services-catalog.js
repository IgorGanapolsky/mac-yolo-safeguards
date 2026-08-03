#!/usr/bin/env node
'use strict';

/**
 * ai-services-catalog.js — Productize District-style AI service cards for ThumbGate/Hermes.
 *
 *   node tools/ai-services-catalog.js
 *   node tools/ai-services-catalog.js --json
 *   node tools/ai-services-catalog.js --markdown
 *   node tools/ai-services-catalog.js --validate
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const CATALOG = path.join(REPO, 'config', 'ai-services-catalog.json');

function load() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

function validate(cat) {
  const errors = [];
  if (!cat.version) errors.push('missing version');
  if (!Array.isArray(cat.services) || cat.services.length < 5) {
    errors.push('need ≥5 services (District card count)');
  }
  if (!Array.isArray(cat.journey) || cat.journey.length !== 3) {
    errors.push('journey must be 3 steps (Imagine/Innovate/Ignite analog)');
  }
  for (const s of cat.services || []) {
    if (!s.id || !s.title || !s.summary) errors.push(`service incomplete: ${s.id || '?'}`);
    if (!s.districtAnalog) errors.push(`${s.id}: missing districtAnalog`);
    if (!s.cta) errors.push(`${s.id}: missing cta`);
  }
  const offers = cat.offers || {};
  for (const k of ['diagnostic', 'hardening', 'continuity']) {
    if (!offers[k]) errors.push(`missing offer ${k}`);
  }
  // Core tools that must exist on every checkout of this catalog PR
  const requiredCore = [
    'tools/ai-services-catalog.js',
    'tools/agent-anomaly-detect.js',
    'tools/ship-claim-gate.js',
  ];
  for (const rel of requiredCore) {
    if (!fs.existsSync(path.join(REPO, rel))) errors.push(`missing required core: ${rel}`);
  }
  // Optional tools (may land via security PR): warn only into errors if STRICT
  if (process.env.AI_CATALOG_STRICT_TOOLS === '1') {
    for (const s of cat.services || []) {
      for (const tool of s.tools || []) {
        if (!tool.startsWith('tools/') || !tool.endsWith('.js')) continue;
        if (!fs.existsSync(path.join(REPO, tool))) errors.push(`missing tool path: ${tool}`);
      }
    }
  }
  return errors;
}

function printHuman(cat) {
  console.log(`\n=== AI Services Catalog v${cat.version} (${cat.asOf}) ===`);
  console.log(cat.productHero?.tagline || '');
  console.log(`CTA: ${cat.productHero?.primaryCta || ''}`);
  console.log('\nJourney (District 1-2-3 → ours):');
  for (const j of cat.journey || []) {
    console.log(`  ${j.districtAnalog} → ${j.ours}: ${j.offer}${j.priceUsd != null ? ` ($${j.priceUsd})` : ''}`);
  }
  console.log('\nServices:');
  for (const s of cat.services || []) {
    console.log(`\n  [${s.id}] ${s.title}`);
    console.log(`    District: ${s.districtAnalog}`);
    console.log(`    ${s.summary}`);
    console.log(`    CTA→ ${s.cta} · proof: ${s.proofMetric || '—'}`);
  }
  console.log('\nOffers:');
  for (const [k, o] of Object.entries(cat.offers || {})) {
    console.log(`  ${k}: ${o.name}${o.priceUsd != null ? ` $${o.priceUsd}` : o.priceSource ? ` (${o.priceSource})` : ''}`);
  }
}

function toMarkdown(cat) {
  const lines = [
    `# ${cat.productHero?.name || 'AI Services'}`,
    '',
    `> ${cat.productHero?.tagline || ''}`,
    '',
    `**As of:** ${cat.asOf} · Packaging inspired by [District Cyber AI services](${cat.sourceInspiration?.url || ''}) (structure only; we sell product + diagnostic sprints, not body-shop outsourcing).`,
    '',
    '## 1 → 2 → 3',
    '',
    '| District | Ours | Offer |',
    '|----------|------|-------|',
  ];
  for (const j of cat.journey || []) {
    const price = j.priceUsd != null ? `$${j.priceUsd}` : j.priceNote || 'live plan';
    lines.push(`| ${j.districtAnalog} | **${j.ours}** | ${j.offer} (${price}) |`);
  }
  lines.push('', '## Service cards', '');
  for (const s of cat.services || []) {
    lines.push(`### ${s.title}`, '', s.summary, '', `*District analog:* ${s.districtAnalog}`, '', `*Proof:* ${s.proofMetric || '—'}`, '');
  }
  lines.push('## Buy', '');
  lines.push(`- Product: ${cat.productHero?.primaryCta}`, `- Pricing: ${cat.productHero?.buyCta}`, '');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`ai-services-catalog

Usage:
  node tools/ai-services-catalog.js
  node tools/ai-services-catalog.js --json
  node tools/ai-services-catalog.js --markdown
  node tools/ai-services-catalog.js --validate
`);
    return;
  }
  const cat = load();
  if (args.includes('--validate')) {
    const errors = validate(cat);
    if (errors.length) {
      console.error('INVALID catalog:');
      errors.forEach((e) => console.error(' -', e));
      process.exitCode = 1;
      return;
    }
    console.log('PASS ai-services-catalog valid');
    return;
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(cat, null, 2));
    return;
  }
  if (args.includes('--markdown')) {
    console.log(toMarkdown(cat));
    return;
  }
  printHuman(cat);
}

if (require.main === module) main();
module.exports = { load, validate, toMarkdown };
