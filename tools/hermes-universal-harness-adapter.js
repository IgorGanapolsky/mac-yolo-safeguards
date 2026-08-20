#!/usr/bin/env node
/**
 * tools/hermes-universal-harness-adapter.js
 * 
 * Universal Coding Agent Harness Adapter & Router
 * Stolen from Screenpipe v2.6.56 (Activity & Universal Harness Engine).
 * 
 * Supported Harnesses:
 * - Cursor (Grok & Sonnet via ACP / IDE bridge)
 * - Claude Code (Native tool permissions + subagents)
 * - Codex / OpenAI (Structured outputs & MCP bridge)
 * - GitHub Copilot CLI (Terminal auto-execution)
 * - Ollama / Local (Zero-cost offline inference)
 * - Antigravity (AGY Multi-Agent Architecture)
 */

'use strict';

const crypto = require('node:crypto');

const SUPPORTED_HARNESSES = {
  CURSOR: {
    id: 'cursor',
    name: 'Cursor IDE',
    defaultModel: 'grok-4.5',
    capabilities: ['diff_patch', 'terminal', 'file_edit', 'browser'],
    permissionModel: 'workspace_scoped',
  },
  CLAUDE_CODE: {
    id: 'claude-code',
    name: 'Claude Code',
    defaultModel: 'claude-3-7-sonnet',
    capabilities: ['subagents', 'read_write_execute', 'mcp'],
    permissionModel: 'native_tool_confirmation',
  },
  CODEX: {
    id: 'codex',
    name: 'OpenAI Codex',
    defaultModel: 'gpt-4o',
    capabilities: ['structured_outputs', 'mcp', 'code_interpreter'],
    permissionModel: 'strict_sandbox',
  },
  COPILOT: {
    id: 'github-copilot',
    name: 'GitHub Copilot CLI',
    defaultModel: 'copilot-chat',
    capabilities: ['terminal_suggest', 'git_explain'],
    permissionModel: 'user_prompt',
  },
  OLLAMA: {
    id: 'ollama',
    name: 'Ollama Local Engine',
    defaultModel: 'qwen2.5-coder:32b',
    capabilities: ['zero_cost_local', 'offline_inference'],
    permissionModel: 'local_isolated',
  },
  ANTIGRAVITY: {
    id: 'antigravity',
    name: 'Google Antigravity SDK',
    defaultModel: 'gemini-2.5-pro',
    capabilities: ['multi_agent_swarm', 'tool_virtualization', 'memory_rag'],
    permissionModel: 'agent_mode_always',
  },
  GROK: {
    id: 'grok',
    name: 'Grok Build / xAI',
    defaultModel: 'grok-4.5',
    capabilities: ['file_edit', 'terminal', 'workflows', 'skills'],
    permissionModel: 'agent_mode_always',
  },
  HERMES_YOLO: {
    id: 'hermes-yolo',
    name: 'Hermes YOLO (local Mac)',
    defaultModel: 'local-fleet',
    capabilities: ['local_tools', 'zero_marginal_cloud'],
    permissionModel: 'local_isolated',
  },
};

/**
 * Resolves the optimal harness configuration based on environment and task scope.
 */
function resolveHarness(harnessName, options = {}) {
  const normalized = String(harnessName || '').trim().toLowerCase();
  for (const [key, spec] of Object.entries(SUPPORTED_HARNESSES)) {
    if (spec.id === normalized || key.toLowerCase() === normalized || spec.name.toLowerCase().includes(normalized)) {
      return {
        ...spec,
        selectedModel: options.modelOverride || spec.defaultModel,
        endpoint: options.endpoint || (spec.id === 'ollama' ? 'http://localhost:11434/v1' : 'cloud'),
      };
    }
  }
  // Fleet default: Grok / local — not Antigravity cloud
  return {
    ...SUPPORTED_HARNESSES.GROK,
    selectedModel: options.modelOverride || SUPPORTED_HARNESSES.GROK.defaultModel,
    endpoint: 'local-or-subscription',
    fallbackReason: 'unknown_harness_defaulted_to_grok',
  };
}

/**
 * Formats a cross-harness execution envelope.
 */
function createHarnessEnvelope(task, harnessConfig) {
  const envelopeId = `env_${crypto.randomUUID().slice(0, 12)}`;
  return {
    id: envelopeId,
    timestamp: new Date().toISOString(),
    harness: harnessConfig.id,
    model: harnessConfig.selectedModel,
    task: {
      id: task.id || crypto.randomUUID(),
      prompt: task.prompt,
      context: task.context || {},
    },
    capabilities: harnessConfig.capabilities,
    permissionModel: harnessConfig.permissionModel,
  };
}

module.exports = {
  SUPPORTED_HARNESSES,
  resolveHarness,
  createHarnessEnvelope,
};

if (require.main === module) {
  console.log('=== Screenpipe-Style Universal Harness Adapter ===');
  const resolved = resolveHarness('cursor', { modelOverride: 'grok-4.5' });
  console.log('Resolved Harness:', resolved);
  const envelope = createHarnessEnvelope({ prompt: 'Refactor test suite' }, resolved);
  console.log('Harness Envelope:', JSON.stringify(envelope, null, 2));
}
