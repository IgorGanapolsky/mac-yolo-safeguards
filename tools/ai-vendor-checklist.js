#!/usr/bin/env node
/**
 * tools/ai-vendor-checklist.js
 *
 * 1-Page AI Vendor Due Diligence Checklist (Anti-AI-Washing Stack)
 * Evaluates AI vendors/SaaS tools on 5 transparency signals to prevent buying
 * or integrating "AI-washed" products.
 *
 * Usage:
 *   node tools/ai-vendor-checklist.js --vendor "Acme AI" --model-card yes --open-weights no --lineage yes --governance yes --concrete-claims yes
 *   node tools/ai-vendor-checklist.js --json
 */

const fs = require('fs');
const path = require('path');

const CHECKLIST_FILE = path.join(__dirname, '..', '.hermes', 'vendor-audit-records.json');

function evaluateVendor(params) {
  const vendorName = params.vendor || 'Unknown Vendor';
  const checks = [
    {
      id: 'model_transparency',
      title: 'Model Transparency & Card',
      pass: params['model-card'] === 'yes' || params['model-card'] === true,
      weight: 20,
      detail: 'Published model card or explicit LLM endpoint provider declared.',
    },
    {
      id: 'benchmark_lineage',
      title: 'Benchmark Methodology & Lineage',
      pass: params.lineage === 'yes' || params.lineage === true,
      weight: 20,
      detail: 'Reproducible benchmark scores and dataset provenance provided.',
    },
    {
      id: 'data_governance',
      title: 'Data Privacy & Safety',
      pass: params.governance === 'yes' || params.governance === true,
      weight: 20,
      detail: 'Clear customer data retention, encryption, and no-training guarantee.',
    },
    {
      id: 'hallucination_mitigation',
      title: 'Hallucination & Bias Controls',
      pass: params.safety === 'yes' || params.safety === true,
      weight: 20,
      detail: 'Explicit grounding, human review gates, or fallback architecture.',
    },
    {
      id: 'concrete_outcomes',
      title: 'Concrete Outcome Marketing',
      pass: params['concrete-claims'] === 'yes' || params['concrete-claims'] === true,
      weight: 20,
      detail: 'Product copy states specific automations, not overblown AI magic.',
    },
  ];

  const earned = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  const status = earned >= 80 ? 'APPROVED' : earned >= 60 ? 'CONDITIONAL' : 'REJECTED (AI-WASHED)';

  const audit = {
    timestamp: new Date().toISOString(),
    vendor: vendorName,
    score: earned,
    status,
    checks,
  };

  saveAudit(audit);
  return audit;
}

function saveAudit(audit) {
  const dir = path.dirname(CHECKLIST_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let records = [];
  if (fs.existsSync(CHECKLIST_FILE)) {
    try {
      records = JSON.parse(fs.readFileSync(CHECKLIST_FILE, 'utf8'));
    } catch {
      records = [];
    }
  }

  records.unshift(audit);
  fs.writeFileSync(CHECKLIST_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function main() {
  const args = parseArgs();

  if (!args.vendor && !args.list) {
    // Default demo run if no vendor specified
    args.vendor = 'Sample Vetted Vendor';
    args['model-card'] = 'yes';
    args.lineage = 'yes';
    args.governance = 'yes';
    args.safety = 'yes';
    args['concrete-claims'] = 'yes';
  }

  if (args.vendor) {
    const audit = evaluateVendor(args);
    if (args.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(`\n🛡️ AI Vendor Due Diligence Audit`);
      console.log(`==============================`);
      console.log(`Vendor: ${audit.vendor}`);
      console.log(`Score:  ${audit.score}/100 | Status: ${audit.status}`);
      console.log(`\nCriteria Checklist:`);
      audit.checks.forEach((c) => {
        console.log(`  [${c.pass ? '✅ PASS' : '❌ FAIL'}] ${c.title} — ${c.detail}`);
      });
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { evaluateVendor };
