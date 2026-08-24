#!/usr/bin/env node
'use strict';

/**
 * AI Tech Debt Register & Workflow Inventory
 *
 * Implements AI Production Engineering Governance:
 * 1. AI/Agent Workflow Inventory:
 *    - Catalogs all coding agents, RAG apps, automations, tool integrations, models, data sources, and credentials.
 *
 * 2. AI Tech Debt Register:
 *    - Tracks generated code and automations with ownership, business purpose, model/prompt versions,
 *      test coverage, operational risk rating, review-by dates, and lifecycle states (prototype -> promoted -> retired).
 *
 * 3. Proactive Tech Debt Auditor & Lifecycle Gate:
 *    - Automatically identifies unowned prototypes, stale prompt versions, expired review-by dates,
 *      and low-coverage unverified agent-generated code.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_WORKFLOWS = [
  {
    id: 'wf-coding-agent',
    name: 'Antigravity Autonomous Pair Programmer',
    category: 'coding_agent',
    model: 'Ollama / Claude 3.7 Sonnet',
    dataSources: ['local_git_repo', 'docs/vault', 'plan.md'],
    toolsAvailable: ['run_command', 'replace_file_content', 'view_file', 'mcp_thumbgate'],
    sensitiveDataTouched: ['local_codebase', 'git_history'],
    sideEffects: ['code_commits', 'pr_creation', 'command_execution'],
    credentialsAccess: ['gh_keychain', 'local_env'],
    owner: 'Igor Ganapolsky',
  },
  {
    id: 'wf-rag-lessons',
    name: 'ThumbGate Dynamic Lessons RAG',
    category: 'rag_app',
    model: 'D1 Vector / Cloudflare Workers',
    dataSources: ['response_feedback', 'tasks_table', 'threads_table'],
    toolsAvailable: ['mcp__thumbgate__recall', 'api_lessons'],
    sensitiveDataTouched: ['user_feedback', 'prompt_history'],
    sideEffects: ['context_injection'],
    credentialsAccess: ['session_jwt'],
    owner: 'Chief Agent',
  },
  {
    id: 'wf-revenue-loop',
    name: 'Autonomous Revenue Pipeline & Cash Loop',
    category: 'automation',
    model: 'Rule-Engine + Critic LLM',
    dataSources: ['business_os/revenue', 'pipeline-status.tsv'],
    toolsAvailable: ['revenue_loop', 'outreach_critic', 'stripe_monitor'],
    sensitiveDataTouched: ['b2b_leads', 'stripe_payment_links'],
    sideEffects: ['draft_outreach', 'stripe_verification'],
    credentialsAccess: ['stripe_keychain', 'resend_keychain'],
    owner: 'Revenue Ralph',
  },
];

class AITechDebtRegister {
  constructor(options = {}) {
    this.workflows = [...DEFAULT_WORKFLOWS];
    this.debtEntries = [];
    this.options = options;
  }

  /**
   * Registers an agent workflow into the inventory
   */
  registerWorkflow(workflow) {
    if (!workflow.id || !workflow.name || !workflow.owner) {
      throw new Error("Workflow must have 'id', 'name', and 'owner'.");
    }
    this.workflows.push(workflow);
  }

  /**
   * Adds an AI-generated artifact / automation into the tech debt register
   */
  registerDebtEntry(entry) {
    const {
      id = `debt_${Date.now()}`,
      workflowId,
      artifactPath,
      businessPurpose,
      modelPromptVersion = 'v1.0.0',
      owner = 'unassigned',
      testCoveragePct = 0,
      operationalRisk = 'medium',
      status = 'prototype',
      reviewByDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    } = entry;

    if (!artifactPath || !businessPurpose) {
      throw new Error("Debt entry requires 'artifactPath' and 'businessPurpose'.");
    }

    const record = {
      id,
      workflowId,
      artifactPath,
      businessPurpose,
      modelPromptVersion,
      owner,
      testCoveragePct: Number(testCoveragePct),
      operationalRisk, // 'low' | 'medium' | 'high' | 'critical'
      status, // 'prototype' | 'promoted' | 'deprecated' | 'retired'
      reviewByDate,
      registeredAt: new Date().toISOString(),
    };

    this.debtEntries.push(record);
    return record;
  }

  /**
   * Audits the tech debt register for operational risks and expiration dates
   */
  auditTechDebt(currentDate = new Date().toISOString().split('T')[0]) {
    const overdueEntries = [];
    const unownedPrototypes = [];
    const lowCoverageEntries = [];
    const highRiskEntries = [];

    for (const entry of this.debtEntries) {
      // 1. Overdue review check
      if (entry.status !== 'retired' && entry.reviewByDate < currentDate) {
        overdueEntries.push(entry);
      }

      // 2. Unowned prototype check
      if (entry.status === 'prototype' && (entry.owner === 'unassigned' || !entry.owner)) {
        unownedPrototypes.push(entry);
      }

      // 3. Low test coverage check
      if (entry.status === 'promoted' && entry.testCoveragePct < 80) {
        lowCoverageEntries.push(entry);
      }

      // 4. High/Critical operational risk
      if (['high', 'critical'].includes(entry.operationalRisk) && entry.status === 'prototype') {
        highRiskEntries.push(entry);
      }
    }

    const totalEntries = this.debtEntries.length;
    const totalPrototypes = this.debtEntries.filter((e) => e.status === 'prototype').length;
    const totalPromoted = this.debtEntries.filter((e) => e.status === 'promoted').length;
    const totalRetired = this.debtEntries.filter((e) => e.status === 'retired').length;

    return {
      auditedAt: new Date().toISOString(),
      summary: {
        totalWorkflows: this.workflows.length,
        totalDebtEntries: totalEntries,
        prototypes: totalPrototypes,
        promoted: totalPromoted,
        retired: totalRetired,
        overdueReviews: overdueEntries.length,
        unownedPrototypes: unownedPrototypes.length,
        lowCoveragePromoted: lowCoverageEntries.length,
        highRiskPrototypes: highRiskEntries.length,
      },
      overdueEntries,
      unownedPrototypes,
      lowCoverageEntries,
      highRiskEntries,
      posture: overdueEntries.length === 0 && unownedPrototypes.length === 0 ? 'controlled' : 'action_required',
    };
  }

  /**
   * Generates a markdown tech debt summary report
   */
  generateMarkdownReport() {
    const audit = this.auditTechDebt();

    return `
# 📋 AI Tech Debt & Workflow Governance Register

- **Total AI Workflows Tracked**: ${audit.summary.totalWorkflows}
- **Total Tracked Generated Artifacts**: ${audit.summary.totalDebtEntries}
- **Governance Posture**: **${audit.posture.toUpperCase()}**

## 📊 Inventory & Risk Breakdown

| Status | Count |
| :--- | :--- |
| **Prototypes** | ${audit.summary.prototypes} |
| **Promoted (Production)** | ${audit.summary.promoted} |
| **Retired** | ${audit.summary.retired} |
| **Overdue Reviews** | ${audit.summary.overdueReviews} |
| **Unowned Prototypes** | ${audit.summary.unownedPrototypes} |
| **Low-Coverage Promoted Code (<80%)** | ${audit.summary.lowCoveragePromoted} |

## 🛠️ Workflows Registered
${this.workflows.map((wf) => `- **${wf.name}** (\`${wf.id}\`): Owner: \`${wf.owner}\` | Model: \`${wf.model}\``).join('\n')}

---
*Generated by AI Tech Debt Register · ThumbGate Fleet Governance*
`.trim();
  }
}

module.exports = {
  DEFAULT_WORKFLOWS,
  AITechDebtRegister,
};

if (require.main === module) {
  console.log('--- AI Tech Debt Register ---');
  const register = new AITechDebtRegister();
  register.registerDebtEntry({
    workflowId: 'wf-coding-agent',
    artifactPath: 'tools/temp-proto.js',
    businessPurpose: 'Rapid proof-of-concept for scraper',
    owner: 'Igor',
    testCoveragePct: 90,
    status: 'promoted',
    reviewByDate: '2026-09-01',
  });
  console.log(register.generateMarkdownReport());
}
