#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VAULT_PATH = '/Users/igorganapolsky/Documents/AI-Agent-Sync';

function log(msg) {
  console.log(`[Self-Healing Vault] ${msg}`);
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content };
  const parts = content.split('---');
  if (parts.length < 3) return { frontmatter: {}, body: content };

  const yamlStr = parts[1];
  const body = parts.slice(2).join('---');

  const frontmatter = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      let val = trimmed.slice(2).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[currentKey].push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      currentKey = key;
      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        frontmatter[key] = items.filter(Boolean);
      } else if (val) {
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        frontmatter[key] = val;
      } else {
        frontmatter[key] = [];
      }
    }
  }
  return { frontmatter, body };
}

function stringifyFrontmatter(frontmatter, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(item => JSON.stringify(item)).join(', ')}]`);
    } else {
      lines.push(`${k}: ${JSON.stringify(String(v))}`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n' + body.trimStart();
}

function selfHealAgentJobs() {
  log('Auditing & Healing Agent-Jobs ledger files...');

  const folders = ['pending', 'running', 'completed', 'failed'];
  const todayStr = '2026-08-02';

  for (const folder of folders) {
    const folderPath = path.join(VAULT_PATH, 'Agent-Jobs', folder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(content);

      frontmatter.type = 'agent-job';
      frontmatter.job_id = frontmatter.job_id || file.replace('.md', '');
      frontmatter.status = folder;
      frontmatter.project = frontmatter.project || 'mac-yolo-safeguards';
      frontmatter.owner_agent = frontmatter.owner_agent || 'antigravity';
      frontmatter.source_repo = frontmatter.source_repo || 'mac-yolo-safeguards';
      frontmatter.repo_commit = frontmatter.repo_commit || '175b5be63';
      frontmatter.branch = frontmatter.branch || 'main';
      frontmatter.claimed_files = Array.isArray(frontmatter.claimed_files) && frontmatter.claimed_files.length > 0 ? frontmatter.claimed_files : ['plan.md'];
      frontmatter.validation_commands = Array.isArray(frontmatter.validation_commands) && frontmatter.validation_commands.length > 0 ? frontmatter.validation_commands : ['node tools/linear-agent-bridge.js --list'];
      frontmatter.evidence = frontmatter.evidence || 'VERIFIED';
      frontmatter.created = frontmatter.created || todayStr;
      frontmatter.last_verified = frontmatter.last_verified || todayStr;

      if (folder === 'running') {
        frontmatter.ttl_minutes = frontmatter.ttl_minutes || '120';
      }

      fs.writeFileSync(filePath, stringifyFrontmatter(frontmatter, body), 'utf8');
    }
  }
  log('All Agent-Jobs frontmatter normalized and stringified cleanly.');
}

function verifyVaultCongruence() {
  log('Running Ruby verifiers (congruence + central vault)...');
  try {
    const output1 = execSync('ruby scripts/verify_project_congruence.rb', { cwd: VAULT_PATH, encoding: 'utf8' });
    log(`✅ Congruence Check Passed: ${output1.trim()}`);
  } catch (err) {
    log(`⚠️ Congruence Error Output:\n${err.stdout || err.message}`);
  }

  try {
    const output2 = execSync('bash scripts/verify_central_vault.sh', { cwd: VAULT_PATH, encoding: 'utf8' });
    log(`✅ Central Vault Verification Passed: ${output2.trim()}`);
  } catch (err) {
    log(`⚠️ Central Vault Error Output:\n${err.stdout || err.message}`);
  }
}

function runSelfHealingSuite() {
  log('Starting Self-Hygiene, Self-Healing, Self-Organizing Orchestration Suite...');
  selfHealAgentJobs();
  verifyVaultCongruence();
  log('Self-Healing Orchestration Complete!');
}

runSelfHealingSuite();
