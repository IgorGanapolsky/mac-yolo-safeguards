/**
 * tests/test-hermes-screenpipe-steals.js
 * 
 * Unit tests for Screenpipe v2.6.56 stolen capabilities:
 * 1. Universal Harness Adapter
 * 2. Activity-to-Skill Distiller
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {
  SUPPORTED_HARNESSES,
  resolveHarness,
  createHarnessEnvelope,
} = require('../tools/hermes-universal-harness-adapter');
const {
  distillActivityIntoSkill,
  synthesizeAndSaveSkill,
} = require('../tools/hermes-activity-skill-distiller');

test('Universal Harness Adapter resolves Cursor, Claude Code, Codex, Ollama correctly', () => {
  const cursor = resolveHarness('cursor');
  assert.equal(cursor.id, 'cursor');
  assert.equal(cursor.defaultModel, 'grok-4.5');

  const claude = resolveHarness('claude-code');
  assert.equal(claude.id, 'claude-code');
  assert.equal(claude.defaultModel, 'claude-3-7-sonnet');

  const ollama = resolveHarness('ollama');
  assert.equal(ollama.id, 'ollama');
  assert.equal(ollama.endpoint, 'http://localhost:11434/v1');

  // Fallback defaults to Antigravity / Agent mode always
  const fallback = resolveHarness('unknown-agent');
  assert.equal(fallback.id, 'antigravity');
});

test('Universal Harness creates valid execution envelope', () => {
  const harness = resolveHarness('codex', { modelOverride: 'gpt-4o' });
  const envelope = createHarnessEnvelope({ prompt: 'Execute security sweep' }, harness);

  assert.ok(envelope.id.startsWith('env_'));
  assert.equal(envelope.harness, 'codex');
  assert.equal(envelope.model, 'gpt-4o');
  assert.equal(envelope.task.prompt, 'Execute security sweep');
});

test('Activity-to-Skill Distiller synthesizes valid YAML SKILL.md from interval', () => {
  const interval = {
    title: 'PostHog Telemetry Health Check',
    actions: [
      { type: 'command', command: 'node tools/verify-pricing-surfaces.js' },
      { type: 'file_edit', file: 'apps/hermes-control-plane/lib/analytics.ts' },
    ],
    verificationCommand: 'node tests/test-telemetry.js',
    tags: ['posthog', 'analytics', 'telemetry'],
  };

  const distilled = distillActivityIntoSkill(interval);
  assert.equal(distilled.name, 'posthog-telemetry-health-check');
  assert.ok(distilled.skillContent.includes('name: posthog-telemetry-health-check'));
  assert.ok(distilled.skillContent.includes('trigger: ['));
  assert.ok(distilled.skillContent.includes('node tools/verify-pricing-surfaces.js'));
});
