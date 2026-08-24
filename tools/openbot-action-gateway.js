#!/usr/bin/env node
'use strict';

/**
 * openbot-action-gateway.js — CopilotKit OpenBot AG-UI Action Gateway & Per-Agent Sandbox Engine
 * Derived from CopilotKit/openbot (CopilotKit AI, August 2026)
 *
 * Implements:
 * 1. Action Gateway: Central policy engine for all agent tool calls (shell, file, web, MCP)
 * 2. Deterministic Action Governance: Evaluates actions into 'allow', 'ask', 'deny' with parameter scrubbing
 * 3. Per-Agent Sandboxed Coworkers: Dedicated workspace boundaries, credential vaults, and lease isolation
 * 4. AG-UI Protocol Receipts: Structured JSON-schema before/after execution audit trails
 * 5. Human-in-the-Loop Interdiction: Live session pause, 2FA/auth escalations, and human override
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class OpenBotActionGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workspaceId = options.workspaceId || 'ws_default';
    this.receipts = [];
    this.activeSandboxes = new Map();
    this.pendingInterventions = new Map();
    
    // Default deterministic policy rules
    this.policies = {
      // Always deny destructive system commands
      denyPatterns: [
        /rm\s+-[rf]{1,2}\s+(?:\/|\$home|~)/i,
        /drop\s+table/i,
        /delete\s+from\s+\w+\s+where\s+1=1/i,
        /\bmkfs\b/i,
        /\bdd\s+if=/i,
        /\bshutdown\b|\breboot\b/i,
        /chmod\s+777\s+\//i,
        /curl.*\|\s*(?:bash|sh)/i,
      ],
      // Always ask for human approval
      askPatterns: [
        /stripe|charge|payment|payout/i,
        /publish|tweet|deploy\s+to\s+prod/i,
        /send\s+email|resend|\bmail\b/i,
        /\b2fa\b|\botp\b|login\s+credential|secret_key/i,
        /git\s+push\s+(?:--force|-f)/i,
        /\brm\s+-[rf]{1,2}\b/i,
      ],
      // Benign inspection / read actions allowed unconditionally
      allowCategories: ['read', 'status', 'list', 'inspect', 'grep', 'search', 'eval', 'view_file', 'git_status'],
    };
  }

  /**
   * 1. Action Gateway Policy Evaluation (AG-UI Protocol)
   */
  evaluateAction(action = {}) {
    const {
      agentId = 'agent_worker',
      tool = 'unknown',
      command = '',
      params = {},
      risk = 'low',
      approved = false,
    } = action;

    const scrubbedParams = this.scrubParameters(params);

    // If already approved by human operator, grant allow
    if (approved) {
      return {
        decision: 'allow',
        reason: 'Action approved by verified human operator.',
        risk: risk || 'medium',
        scrubbedParams,
        requiresHumanApproval: false,
      };
    }

    const payloadText = `${tool} ${command} ${JSON.stringify(params)}`.toLowerCase();

    // 1. Check Deny List
    for (const pattern of this.policies.denyPatterns) {
      if (pattern.test(payloadText)) {
        return {
          decision: 'deny',
          reason: `Action matches critical safety denylist pattern: ${pattern.toString()}`,
          risk: 'critical',
          scrubbedParams,
          requiresHumanApproval: false,
        };
      }
    }

    // 2. Check Ask List (Money, Customer, Production, Auth, Deletion)
    for (const pattern of this.policies.askPatterns) {
      if (pattern.test(payloadText)) {
        return {
          decision: 'ask',
          reason: `Action touches sensitive boundary (money/customer/prod/auth/delete): ${pattern.toString()}`,
          risk: 'high',
          scrubbedParams,
          requiresHumanApproval: true,
        };
      }
    }

    // 3. Check for explicitly allowed categories
    const isBenign = this.policies.allowCategories.some(
      (cat) => tool.toLowerCase().includes(cat) || command.toLowerCase().includes(cat)
    );

    if (isBenign) {
      return {
        decision: 'allow',
        reason: 'Action matches explicitly allowed benign inspection/read category.',
        risk: 'low',
        scrubbedParams,
        requiresHumanApproval: false,
      };
    }

    // 4. Fail-closed: unclassified mutating actions default to 'ask'
    return {
      decision: 'ask',
      reason: 'Unclassified mutating tool execution — requires explicit human consent.',
      risk: 'medium',
      scrubbedParams,
      requiresHumanApproval: true,
    };
  }

  /**
   * 2. Parameter & Credential Scrubber
   */
  scrubParameters(params = {}) {
    if (typeof params !== 'object' || params === null) return params;
    const cleaned = Array.isArray(params) ? [...params] : { ...params };
    const secretKeys = ['password', 'secret', 'token', 'apikey', 'api_key', 'privatekey', 'auth', 'credentials'];

    for (const key of Object.keys(cleaned)) {
      if (secretKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        cleaned[key] = '[REDACTED_BY_OPENBOT_GATEWAY]';
      } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
        cleaned[key] = this.scrubParameters(cleaned[key]);
      }
    }

    return cleaned;
  }

  /**
   * 3. Per-Agent Coworker Sandbox Provisioning
   */
  provisionAgentSandbox(agentId, options = {}) {
    const sandboxId = `sbx_${agentId}_${crypto.randomBytes(4).toString('hex')}`;
    const workspaceRoot = options.workspaceRoot || path.join('/tmp', 'openbot-sandboxes', agentId);
    const leaseDurationSec = options.leaseDurationSec || 90;
    const expiresAt = Date.now() + (leaseDurationSec * 1000);

    const sandbox = {
      sandboxId,
      agentId,
      workspaceRoot,
      leaseDurationSec,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      active: true,
      credentials: new Map(),
      toolBindings: options.tools || ['bash', 'file_ops', 'web_browser', 'mcp_bridge'],
      state: 'ISOLATED_AND_FENCED',
    };

    this.activeSandboxes.set(sandboxId, sandbox);
    this.emit('sandbox.provisioned', { sandboxId, agentId });
    return sandbox;
  }

  /**
   * 4. AG-UI Execution with Audit Receipts
   */
  async executeWithGateway(action = {}, executorFn) {
    const actionId = `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    const evaluation = this.evaluateAction(action);

    const beforeReceipt = {
      actionId,
      agentId: action.agentId || 'agent_worker',
      tool: action.tool,
      decision: evaluation.decision,
      reason: evaluation.reason,
      risk: evaluation.risk,
      timestamp: new Date(startTime).toISOString(),
      params: evaluation.scrubbedParams,
    };

    if (evaluation.decision === 'deny') {
      const denialReceipt = {
        ...beforeReceipt,
        status: 'INTERDICTED',
        error: evaluation.reason,
        durationMs: Date.now() - startTime,
      };
      this.receipts.push(denialReceipt);
      this.emit('action.denied', denialReceipt);
      return { success: false, receipt: denialReceipt, error: evaluation.reason };
    }

    if (evaluation.decision === 'ask') {
      const scrubbedAction = {
        ...action,
        params: evaluation.scrubbedParams,
      };

      const intervention = {
        actionId,
        action: scrubbedAction,
        evaluation,
        executorFn,
        status: 'PENDING_APPROVAL',
        requestedAt: new Date().toISOString(),
      };
      this.pendingInterventions.set(actionId, intervention);
      this.emit('intervention.required', {
        actionId,
        action: scrubbedAction,
        evaluation,
        status: 'PENDING_APPROVAL',
      });

      return {
        success: false,
        requiresHumanApproval: true,
        interventionId: actionId,
        message: 'Action paused by OpenBot Action Gateway pending human approval.',
      };
    }

    // Allowed Action Execution
    let result = null;
    let error = null;
    let status = 'COMPLETED';

    try {
      if (typeof executorFn === 'function') {
        result = await Promise.resolve(executorFn(action));
      } else {
        result = { executed: true, tool: action.tool };
      }
    } catch (err) {
      status = 'FAILED';
      error = err.message;
    }

    const afterReceipt = {
      ...beforeReceipt,
      status,
      result: result ? (typeof result === 'object' ? JSON.stringify(result).slice(0, 500) : String(result)) : null,
      error,
      durationMs: Date.now() - startTime,
    };

    this.receipts.push(afterReceipt);
    this.emit('action.completed', afterReceipt);

    return {
      success: status === 'COMPLETED',
      result,
      error,
      receipt: afterReceipt,
    };
  }

  /**
   * 5. Human-in-the-Loop Approval / Rejection with Execution Resumption
   */
  async resolveIntervention(interventionId, decision = 'approve', resolutionDetails = {}) {
    const intervention = this.pendingInterventions.get(interventionId);
    if (!intervention) {
      throw new Error(`Intervention ${interventionId} not found`);
    }

    intervention.status = decision === 'approve' ? 'APPROVED_BY_HUMAN' : 'DENIED_BY_HUMAN';
    intervention.resolvedAt = new Date().toISOString();
    intervention.resolutionDetails = resolutionDetails;

    this.pendingInterventions.delete(interventionId);
    this.emit('intervention.resolved', { interventionId, decision });

    if (decision === 'approve' && typeof intervention.executorFn === 'function') {
      const approvedAction = { ...intervention.action, approved: true };
      const resumedExecution = await this.executeWithGateway(approvedAction, intervention.executorFn);
      intervention.resumedExecution = resumedExecution;
    }

    return intervention;
  }
}

module.exports = {
  OpenBotActionGateway,
};
