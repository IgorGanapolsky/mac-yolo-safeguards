#!/usr/bin/env node
/**
 * Linear-style Tags for plan.md
 *
 * This script analyzes tasks in plan.md and updates their tags column
 * based on task content (description, files, etc.).
 *
 * Usage: node tools/linear-tags-plan-md.js [--preview]
 */

const fs = require('fs');
const path = require('path');

const PLAN_PATH = path.join(__dirname, '../plan.md');

// Domain keywords that map to tags
const DOMAIN_KEYWORDS = [
  { keywords: ['hermes', 'hermes-mobile'], tags: ['hermes', 'mobile'] },
  { keywords: ['thumbgate'], tags: ['thumbgate', 'backend'] },
  { keywords: ['mac', 'mini', 'pro', 'laptop'], tags: ['mac'] },
  { keywords: ['ipad', 'ios'], tags: ['ios', 'tablet'] },
  { keywords: ['android'], tags: ['android'] },
  { keywords: ['usb'], tags: ['usb', 'connection'] },
  { keywords: ['tailscale'], tags: ['tailscale', 'network'] },
  { keywords: ['gateway', 'profile', 'picker'], tags: ['gateway'] },
  { keywords: ['pair', 'qr', 'intent', 'deep-link'], tags: ['pairing'] },
  { keywords: ['transport', 'websocket', 'api'], tags: ['api', 'backend'] },
  { keywords: ['e2e', 'test', 'contract', 'verification'], tags: ['testing'] },
  { keywords: ['ci', 'dagger', 'act', 'build', 'eas'], tags: ['ci-cd'] },
  { keywords: ['otag', 'ota'], tags: ['ota', 'deployment'] },
  { keywords: ['store', 'aso', 'play', 'apple', 'asc', 'screenshot', 'metadata'], tags: ['store'] },
  { keywords: ['billing', 'subscription', 'wallet', 'stripe', 'apollo', 'token', 'purchase', 'upgrade', 'approve'], tags: ['billing'] },
  { keywords: ['spend', 'guard', 'security', 'audit', 'credential', 'secret', 'key'], tags: ['security'] },
];

// Type keywords
const TYPE_KEYWORDS = [
  { keywords: ['add', 'implement', 'create', 'wire', 'feature', 'integrate', 'subscri'], tags: ['feature'] },
  { keywords: ['fix', 'repair', 'refactor', 'rework'], tags: ['bug'] },
  { keywords: ['cleanup', 'remove', 'delete', 'purge', 'cap', 'clamp'], tags: ['chore'] },
  { keywords: ['audit', 'security', 'guard', 'block', 'deny', 'bypass'], tags: ['security'] },
  { keywords: ['test', 'contract', 'verification', 'e2e'], tags: ['testing'] },
  { keywords: ['research', 'study', 'analysis', 'deep-research'], tags: ['research'] },
];

/**
 * Get priority from task ID (e.g., T-P0-APOLLO becomes P0)
 */
function getPriority(taskId) {
  const match = taskId.match(/T-P([0-3])-/);
  return match ? `P${match[1]}` : '';
}

/**
 * Analyze description for type
 */
function getType(description) {
  const desc = description.toLowerCase();
  for (const { keywords, tags } of TYPE_KEYWORDS) {
    if (keywords.some(k => desc.includes(k))) {
      return tags[0];
    }
  }
  return '';
}

/**
 * Analyze task line and extract tags
 * Input format: | T-ID | [tags] | Description | ...
 */
function analyzeTaskLine(line) {
  const tags = [];

  // Extract task ID from the line
  const idMatch = line.match(/\| (T-[A-Z0-9-]+) \|/);
  if (idMatch) {
    const priority = getPriority(idMatch[1]);
    if (priority) tags.push(priority);
  }

  // Split by | to get columns
  const cols = line.split('|');

  // Find description - it's typically column 2 or 3
  // Column order: [1] T-ID, [2] (tags or empty), [3] Description
  let description = '';
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i].trim();
    if (col.startsWith('[') && col.includes(']')) {
      // This is the tags column, next column is description
      if (i + 1 < cols.length) {
        description = cols[i + 1].trim();
      }
      break;
    }
  }

  if (description) {
    const type = getType(description);
    if (type) tags.push(type);

    // Check domain keywords in description
    for (const { keywords, tags: domainTags } of DOMAIN_KEYWORDS) {
      const descLower = description.toLowerCase();
      if (keywords.some(k => descLower.includes(k))) {
        tags.push(...domainTags);
      }
    }
  }

  // Check file paths in the line
  const fileMatches = line.matchAll(/`([^`]+)`/g);
  for (const match of fileMatches) {
    const filePath = match[1].toLowerCase();

    if (filePath.includes('hermes-mobile')) { tags.push('mobile', 'hermes'); }
    if (filePath.includes('apps/hermes-control-plane')) { tags.push('web', 'thumbgate'); }
    if (filePath.includes('tools/')) { tags.push('infrastructure'); }
    if (filePath.includes('scripts/')) { tags.push('infrastructure'); }
    if (filePath.includes('tests/')) { tags.push('testing'); }
    if (filePath.includes('hooks/')) { tags.push('security'); }
    if (filePath.includes('src/components/')) { tags.push('ui'); }
    if (filePath.includes('src/screens/')) { tags.push('ui'); }
    if (filePath.includes('.cursor/skills/')) { tags.push('feature'); }
    if (filePath.includes('skills/')) { tags.push('feature'); }
  }

  return [...new Set(tags)];
}

/**
 * Update tags in a task line
 * The table format is:
 * | T-ID | [tags] | Description | Status | Owner | Files | Progress |
 */
function updateTagsInLine(line) {
  // Match line starting with | followed by T-
  const fullMatch = line.match(/^((\|)(\s*)|(^\s*))?(T-[A-Z0-9-]+) \|/);
  if (!fullMatch) return line;

  const taskId = fullMatch[5];

  // Skip header row
  if (taskId === 'Task ID') return line;

  const tags = analyzeTaskLine(line);
  const tagStr = tags.length > 0 ? `[${tags.join(', ')}]` : '';

  // Replace the tags column (column after T-ID)
  // Pattern: | T-ID | old-tags | becomes | T-ID | new-tags |
  const result = line.replace(
    /(\| T-[A-Z0-9-]+ \|)(\[[^\]]*\]|[^\|]*)(\|)/,
    `$1 ${tagStr}$3`
  );

  return result;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');

  let content = fs.readFileSync(PLAN_PATH, 'utf8');
  let lines = content.split('\n');

  let newLines = lines.map(line => updateTagsInLine(line));

  if (preview) {
    console.log('Preview of first 50 lines:\n');
    console.log(newLines.slice(0, 50).join('\n'));
  } else {
    fs.writeFileSync(PLAN_PATH, newLines.join('\n'));
    console.log(`Updated ${newLines.length} lines in plan.md with Linear-style tags`);
  }
}

main();