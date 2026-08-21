#!/usr/bin/env node
'use strict';

const catalog = require('../config/continuation-prompts.json');

const COMMANDS_BY_TRIGGER = new Map();
for (const command of catalog.commands) {
  for (const trigger of command.triggers) COMMANDS_BY_TRIGGER.set(trigger, command);
}

function normalizeContinuationPrompt(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:]+$/u, '')
    .trim()
    .replace(/\s+/gu, ' ');
}

function resolveContinuationPrompt(prompt, options = {}) {
  const displayPrompt = String(prompt ?? '').trim();
  const normalized = normalizeContinuationPrompt(displayPrompt);
  const matched = COMMANDS_BY_TRIGGER.get(normalized) || null;
  if (!matched) {
    return {
      applied: false,
      command: null,
      displayPrompt,
      executionPrompt: displayPrompt,
      reason: 'not_continuation_command',
    };
  }
  if (matched.requiresContext && !options.hasContext) {
    return {
      applied: false,
      command: matched.id,
      displayPrompt,
      executionPrompt: displayPrompt,
      reason: 'context_required',
    };
  }
  return {
    applied: true,
    command: matched.id,
    displayPrompt,
    executionPrompt: [
      `[Continuation command: ${matched.canonical}]`,
      matched.instruction,
      'Use the established conversation context as the source of truth. Do not ask the user to repeat context already present.',
    ].join('\n'),
    reason: 'applied',
  };
}

module.exports = {
  CONTINUATION_PROMPT_CATALOG: catalog,
  normalizeContinuationPrompt,
  resolveContinuationPrompt,
};
