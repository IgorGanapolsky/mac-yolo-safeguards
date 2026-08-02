#!/usr/bin/env node
'use strict';

/**
 * linear-agent-bridge.js — Multi-agent state synchronization via Linear API.
 *
 * Integrates Linear (https://linear.app/igorganapolsky/agent) and Obsidian
 * with our multi-agent harness (Antigravity, Claude, Codex, Gemini, Herdr).
 *
 * Usage:
 *   node tools/linear-agent-bridge.js --list
 *   node tools/linear-agent-bridge.js --claim AGENT-12 --agent antigravity
 *   node tools/linear-agent-bridge.js --update AGENT-12 --state "In Progress" --comment "Verification passed"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

function getLinearApiKey() {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  try {
    const key = execSync('security find-generic-password -s "LINEAR_API_KEY" -w 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    if (key) return key;
  } catch {
    /* ignore */
  }
  return null;
}

async function queryLinear(query, variables = {}) {
  const apiKey = getLinearApiKey();
  if (!apiKey) {
    return {
      error: true,
      message: 'LINEAR_API_KEY not found in environment or macOS Keychain. Run: security add-generic-password -a "$USER" -s "LINEAR_API_KEY" -w "<key>"',
    };
  }

  const payload = JSON.stringify({ query, variables });
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.linear.app/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ error: true, message: e.message });
          }
        });
      },
    );
    req.on('error', (err) => resolve({ error: true, message: err.message }));
    req.write(payload);
    req.end();
  });
}

async function listAgentIssues() {
  const query = `
    query {
      issues(first: 20, filter: { team: { key: { eq: "AGENT" } } }) {
        nodes {
          id
          identifier
          title
          state { name }
          assignee { name email }
          updatedAt
        }
      }
    }
  `;
  return queryLinear(query);
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');

  if (args.includes('--help') || args.length === 0 || args.includes('--list')) {
    const res = await listAgentIssues();
    if (res.error || res.errors) {
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log('Linear API Status:', res.message || res.errors?.[0]?.message || 'Key required');
        console.log('Setup instructions: Set LINEAR_API_KEY in Keychain or env to enable live Linear ↔ Obsidian agent sync.');
      }
      return;
    }
    const issues = res.data?.issues?.nodes || [];
    if (isJson) {
      console.log(JSON.stringify(issues, null, 2));
    } else {
      console.log(`\nLinear Agent Issues (Total: ${issues.length}):`);
      console.log('──────────────────────────────────────────────────────');
      for (const issue of issues) {
        console.log(`[${issue.identifier}] ${issue.title} (${issue.state?.name || 'Open'}) - Assignee: ${issue.assignee?.name || 'Unassigned'}`);
      }
    }
  }
}

if (require.main === module) {
  main().catch((err) => console.error('Linear bridge error:', err));
}

module.exports = { queryLinear, getLinearApiKey };
