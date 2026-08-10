#!/usr/bin/env node
'use strict';

/**
 * multiagent-operating-template.js
 * Generates and validates Minimal Operating Templates for autonomous multi-agent tasks
 * based on Ex-Uber Multi-Agent Workflow standards.
 */

const fs = require('fs');
const path = require('path');

function createOperatingTemplate(params = {}) {
  const goal = params.goal || 'Define single actionable deliverable';
  const acceptanceCriteria = params.acceptanceCriteria || ['All unit tests pass (100%)', 'CI green on main'];
  const constraints = params.constraints || ['No desktop hijack', 'Max turn timeout: 90s'];
  const allowedFiles = params.allowedFiles || ['tools/*', 'tests/*'];
  const forbiddenActions = params.forbiddenActions || ['Hardcoded secrets', 'Bypassing verification gates'];
  const requiredCommands = params.requiredCommands || ['bash scripts/verify.sh'];
  const definitionOfDone = params.definitionOfDone || 'Commit SHA + green CI status reported';
  const escalationTrigger = params.escalationTrigger || '3 consecutive test failures or unresolvable blocker';
  const handoffFormat = params.handoffFormat || 'HANDOFF.md with exact diff and test evidence';

  return `
=== MINIMAL OPERATING TEMPLATE ===
Goal: ${goal}
Acceptance criteria:
${acceptanceCriteria.map((c) => `  - ${c}`).join('\n')}
Constraints:
${constraints.map((c) => `  - ${c}`).join('\n')}
Allowed files/tools:
${allowedFiles.map((f) => `  - ${f}`).join('\n')}
Forbidden actions:
${forbiddenActions.map((f) => `  - ${f}`).join('\n')}
Required commands to validate:
${requiredCommands.map((cmd) => `  - ${cmd}`).join('\n')}
Definition of done: ${definitionOfDone}
Escalation trigger: ${escalationTrigger}
Handoff format: ${handoffFormat}
==================================
`.trim();
}

function validateOperatingTemplate(templateText) {
  const requiredFields = [
    'Goal:',
    'Acceptance criteria:',
    'Constraints:',
    'Allowed files/tools:',
    'Forbidden actions:',
    'Required commands to validate:',
    'Definition of done:',
    'Escalation trigger:',
    'Handoff format:',
  ];

  const missing = [];
  for (const field of requiredFields) {
    if (!templateText.includes(field)) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

if (require.main === module) {
  const tpl = createOperatingTemplate();
  console.log(tpl);
  console.log('\nValidation result:', validateOperatingTemplate(tpl));
}

module.exports = {
  createOperatingTemplate,
  validateOperatingTemplate,
};
