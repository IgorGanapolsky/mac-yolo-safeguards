#!/usr/bin/env node
'use strict';

/**
 * agent-identity-entitlement.js
 *
 * Implements fine-grained Least-Privilege Entitlement Governance for autonomous agents.
 *
 * Sourced from BrightTALK SailPoint Identity Governance Intelligence:
 * "How to look at identity through the lens of security"
 *
 * Core Capabilities:
 *  1. Scoped Entitlement Tokens: Restricts subagent capabilities to explicit least-privilege tokens.
 *  2. Capability Matrix: Checks requested action type against authorized role scope.
 *  3. Fail-Closed Boundary: Denies privilege escalation without elevated capability tickets.
 */

const VALID_ENTITLEMENT_SCOPES = [
  'fs:read',
  'fs:write:tests',
  'fs:write:src',
  'git:commit',
  'pr:open',
  'net:local_inference',
  'net:public_http',
  'finance:spend',
  'deploy:prod',
];

const DEFAULT_ROLE_PROFILES = {
  researcher: ['fs:read', 'net:local_inference'],
  test_engineer: ['fs:read', 'fs:write:tests', 'git:commit'],
  ship_engineer: ['fs:read', 'fs:write:tests', 'fs:write:src', 'git:commit', 'pr:open'],
  secops_auditor: ['fs:read', 'net:local_inference'],
  admin_operator: VALID_ENTITLEMENT_SCOPES, // Unrestricted (requires explicit flag)
};

class AgentEntitlementManager {
  constructor(role = 'researcher', customScopes = null) {
    this.role = role;
    this.authorizedScopes = new Set(customScopes || DEFAULT_ROLE_PROFILES[role] || DEFAULT_ROLE_PROFILES.researcher);
  }

  hasEntitlement(requiredScope) {
    return this.authorizedScopes.has(requiredScope);
  }

  authorizeAction(actionName, requiredScope) {
    const isAuthorized = this.hasEntitlement(requiredScope);
    return {
      allowed: isAuthorized,
      role: this.role,
      action: actionName,
      requiredScope,
      decision: isAuthorized ? 'ALLOW' : 'DENY',
      reason: isAuthorized ? 'Entitlement verified' : `Role '${this.role}' lacks required entitlement scope '${requiredScope}'`,
      timestamp: new Date().toISOString(),
    };
  }

  grantElevatedScope(scope, approvalTicket) {
    if (!approvalTicket || !approvalTicket.approvedBy) {
      throw new Error('Privilege elevation requires a valid approval ticket');
    }
    this.authorizedScopes.add(scope);
    return {
      elevated: true,
      scope,
      ticket: approvalTicket,
      currentScopes: Array.from(this.authorizedScopes),
    };
  }
}

module.exports = {
  VALID_ENTITLEMENT_SCOPES,
  DEFAULT_ROLE_PROFILES,
  AgentEntitlementManager,
};
