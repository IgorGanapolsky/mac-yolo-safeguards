#!/usr/bin/env node
// deploy-lock-check.mjs - find an active (in_progress, non-stale) GitHub Deployment
// for the given repo/environment. Prints the active lock as JSON and exits 0 if one
// exists; prints nothing and exits 1 if the environment is clear.
//
// Env vars: DEPLOY_LOCK_REPO, DEPLOY_LOCK_ENVIRONMENT, DEPLOY_LOCK_STALE_MINUTES, GH_TOKEN

const repo = process.env.DEPLOY_LOCK_REPO;
const environment = process.env.DEPLOY_LOCK_ENVIRONMENT;
const staleAfterMinutes = Number(process.env.DEPLOY_LOCK_STALE_MINUTES || "20");
const token = process.env.GH_TOKEN;

if (!repo || !environment || !token) {
  console.error("deploy-lock-check.mjs: DEPLOY_LOCK_REPO, DEPLOY_LOCK_ENVIRONMENT, GH_TOKEN all required");
  process.exit(2);
}

const headers = {
  Authorization: `token ${token}`,
  Accept: "application/vnd.github+json",
};

async function main() {
  const deploymentsRes = await fetch(
    `https://api.github.com/repos/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=5`,
    { headers }
  );
  if (!deploymentsRes.ok) {
    console.error(`deploy-lock-check.mjs: list deployments failed: ${deploymentsRes.status}`);
    process.exit(2);
  }
  const deployments = await deploymentsRes.json();
  const cutoffMs = staleAfterMinutes * 60 * 1000;

  for (const deployment of deployments) {
    const statusesRes = await fetch(deployment.statuses_url, { headers });
    if (!statusesRes.ok) continue;
    const statuses = await statusesRes.json();
    const latest = statuses[0];
    if (latest && latest.state === "in_progress") {
      const ageMs = Date.now() - new Date(deployment.created_at).getTime();
      if (ageMs < cutoffMs) {
        console.log(JSON.stringify({
          id: deployment.id,
          creator: deployment.creator?.login,
          created_at: deployment.created_at,
          age_minutes: Math.round(ageMs / 60000),
        }));
        process.exit(0);
      }
    }
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(`deploy-lock-check.mjs: ${error.message}`);
  process.exit(2);
});
