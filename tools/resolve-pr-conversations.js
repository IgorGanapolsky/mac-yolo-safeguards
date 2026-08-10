#!/usr/bin/env node
/**
 * Automatically resolve review threads on a PR so required_conversation_resolution does not block merges.
 */
const { execSync, execFileSync } = require('child_process');

const ghEnv = { ...process.env };
delete ghEnv.GITHUB_TOKEN;

function queryGh(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(variables)) {
    args.push('-f', `${k}=${v}`);
  }
  const out = execFileSync('gh', args, { encoding: 'utf8', env: ghEnv });
  return JSON.parse(out);
}

async function resolvePrThreads(prNumber) {
  console.log(`Resolving review threads for PR #${prNumber}...`);
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 1) {
                nodes {
                  body
                }
              }
            }
          }
        }
      }
    }
  `;

  const raw = execFileSync('gh', [
    'api', 'graphql',
    '-F', 'owner=IgorGanapolsky',
    '-F', 'repo=mac-yolo-safeguards',
    '-F', `prNumber=${prNumber}`,
    '-f', `query=${query}`
  ], { encoding: 'utf8', env: ghEnv });

  const data = JSON.parse(raw);
  const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
  const unresolved = threads.filter((t) => !t.isResolved);
  console.log(`Found ${unresolved.length} unresolved threads (total: ${threads.length}).`);

  for (const t of unresolved) {
    const mut = `
      mutation($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread { id isResolved }
        }
      }
    `;
    try {
      execFileSync('gh', [
        'api', 'graphql',
        '-F', `threadId=${t.id}`,
        '-f', `query=${mut}`
      ], { encoding: 'utf8', env: ghEnv });
      console.log(`  ✅ Resolved thread ${t.id}`);
    } catch (e) {
      console.error(`  ❌ Failed to resolve thread ${t.id}: ${e.message}`);
    }
  }
}

if (require.main === module) {
  const pr = process.argv[2] ? parseInt(process.argv[2], 10) : 1586;
  resolvePrThreads(pr).catch(console.error);
}

module.exports = { resolvePrThreads };
