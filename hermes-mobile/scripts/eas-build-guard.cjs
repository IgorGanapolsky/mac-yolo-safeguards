#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const { readFileSync } = require('fs');

const SPEND_APPROVAL = 'YES_SPEND_EAS_CREDITS';
const REBUILD_APPROVAL = 'YES_REBUILD_EXISTING_ARTIFACT';
const DEFAULT_MAX_PLAN_PERCENT = 95;

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function usage() {
  console.error(`Usage:
  node scripts/eas-build-guard.cjs --platform <android|ios> --profile <name> [--dry-run] [-- command ...]

Blocks new EAS builds when:
  - the account is at/over the build-credit threshold, unless HERMES_EAS_SPEND_APPROVED=${SPEND_APPROVAL}
  - a build already exists for this commit/platform/profile, unless HERMES_EAS_REBUILD_EXISTING=${REBUILD_APPROVAL}
`);
}

function parseArgs(argv) {
  const args = {
    maxPlanPercent: DEFAULT_MAX_PLAN_PERCENT,
    skipUsage: false,
    skipDuplicate: false,
    dryRun: false,
    selfTest: false,
    command: [],
  };

  const commandIndex = argv.indexOf('--');
  const optionArgs = commandIndex >= 0 ? argv.slice(0, commandIndex) : argv;
  args.command = commandIndex >= 0 ? argv.slice(commandIndex + 1) : [];

  for (let i = 0; i < optionArgs.length; i += 1) {
    const arg = optionArgs[i];
    switch (arg) {
      case '--platform':
        args.platform = optionArgs[++i];
        break;
      case '--profile':
        args.profile = optionArgs[++i];
        break;
      case '--commit':
        args.commit = optionArgs[++i];
        break;
      case '--max-plan-percent':
        args.maxPlanPercent = Number(optionArgs[++i]);
        break;
      case '--skip-usage':
        args.skipUsage = true;
        break;
      case '--skip-duplicate':
        args.skipDuplicate = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--self-test':
        args.selfTest = true;
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseBuildUsage(rawOutput) {
  const output = stripAnsi(rawOutput);
  const jsonStart = output.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(extractFirstJsonObject(output, jsonStart));
      const used = parsed.builds?.plan?.used ?? null;
      const limit = parsed.builds?.plan?.limit ?? null;
      const percent = parsed.builds?.plan?.percentUsed ?? (used != null && limit ? (used / limit) * 100 : null);
      const overageBuilds = parsed.builds?.overage?.count ?? 0;
      const overageDollars = (parsed.builds?.overage?.costCents ?? 0) / 100;
      return {
        used,
        limit,
        percent,
        overageBuilds,
        overageDollars,
      };
    } catch {
      // Fall through to text parsing. EAS prints text when attached to a TTY.
    }
  }

  const planMatch = output.match(/Builds \(plan\):\s*([\d,]+)\/([\d,]+)\s+builds/i);
  const overageMatch = output.match(/Builds \(overage\):\s*([\d,]+)\s+builds\s+\(\$([\d.]+)\)/i);

  const used = planMatch ? Number(planMatch[1].replace(/,/g, '')) : null;
  const limit = planMatch ? Number(planMatch[2].replace(/,/g, '')) : null;
  const percent = used != null && limit ? (used / limit) * 100 : null;
  const overageBuilds = overageMatch ? Number(overageMatch[1].replace(/,/g, '')) : 0;
  const overageDollars = overageMatch ? Number(overageMatch[2]) : 0;

  return {
    used,
    limit,
    percent,
    overageBuilds,
    overageDollars,
  };
}

function extractFirstJsonObject(value, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < value.length; i += 1) {
    const char = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(startIndex, i + 1);
      }
    }
  }

  throw new Error('No complete JSON object found');
}

function getCurrentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function getExpoAccountName() {
  if (process.env.HERMES_EAS_ACCOUNT_NAME) {
    return process.env.HERMES_EAS_ACCOUNT_NAME;
  }
  try {
    return JSON.parse(readFileSync('app.json', 'utf8')).expo?.owner;
  } catch {
    return null;
  }
}

function getUsage() {
  if (process.env.HERMES_EAS_GUARD_USAGE_TEXT) {
    return process.env.HERMES_EAS_GUARD_USAGE_TEXT;
  }
  const accountName = getExpoAccountName();
  if (!accountName) {
    throw new Error('Could not determine Expo account name. Set HERMES_EAS_ACCOUNT_NAME.');
  }
  const result = spawnSync('npx', ['eas-cli', 'account:usage', accountName], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    throw new Error(`eas account:usage failed:\n${combined}`);
  }
  return combined;
}

function getBuilds() {
  if (process.env.HERMES_EAS_GUARD_BUILDS_JSON) {
    return JSON.parse(process.env.HERMES_EAS_GUARD_BUILDS_JSON);
  }
  const raw = execFileSync('npx', ['eas-cli', 'build:list', '--limit', '50', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function normalizePlatform(platform) {
  const value = String(platform || '').toLowerCase();
  if (value === 'android') return 'ANDROID';
  if (value === 'ios') return 'IOS';
  throw new Error(`Unsupported platform: ${platform}`);
}

function shortErrorMessage(error) {
  return String(error?.message || error || 'unknown error').split('\n')[0];
}

function checkUsage(args, failures) {
  if (args.skipUsage) return;

  let parsed;
  try {
    parsed = parseBuildUsage(getUsage());
  } catch (error) {
    failures.push(
      `Could not inspect EAS build-credit usage; failing closed before queueing a paid build. ${shortErrorMessage(error)}`,
    );
    return;
  }

  if (parsed.used == null || parsed.limit == null || parsed.percent == null) {
    failures.push('Could not parse EAS build-credit usage; failing closed before queueing a paid build.');
    return;
  }
  const atOrAboveThreshold = parsed.percent != null && parsed.percent >= args.maxPlanPercent;
  const hasOverage = parsed.overageBuilds > 0 || parsed.overageDollars > 0;

  if ((atOrAboveThreshold || hasOverage) && process.env.HERMES_EAS_SPEND_APPROVED !== SPEND_APPROVAL) {
    const percent = parsed.percent == null ? 'unknown' : `${parsed.percent.toFixed(1)}%`;
    failures.push(
      [
        `EAS build credits are at/over the guardrail: ${percent} used`,
        `plan=${parsed.used ?? '?'} / ${parsed.limit ?? '?'}`,
        `overage=${parsed.overageBuilds} builds ($${parsed.overageDollars.toFixed(2)})`,
        `Set HERMES_EAS_SPEND_APPROVED=${SPEND_APPROVAL} only after an explicit cost checkpoint.`,
      ].join('; '),
    );
  }
}

function checkDuplicateBuild(args, failures) {
  if (args.skipDuplicate) return;

  const platform = normalizePlatform(args.platform);
  let builds;
  try {
    builds = getBuilds();
  } catch (error) {
    failures.push(
      `Could not inspect existing EAS builds; failing closed before queueing a paid build. ${shortErrorMessage(error)}`,
    );
    return;
  }

  const activeStatuses = new Set(['NEW', 'IN_QUEUE', 'IN_PROGRESS']);
  const matching = builds.filter(build => {
    return (
      build.platform === platform &&
      build.buildProfile === args.profile &&
      build.gitCommitHash === args.commit &&
      (build.status === 'FINISHED' || activeStatuses.has(build.status))
    );
  });

  if (matching.length > 0 && process.env.HERMES_EAS_REBUILD_EXISTING !== REBUILD_APPROVAL) {
    const buildLines = matching
      .map(build => `${build.status} ${build.id} ${build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || ''}`.trim())
      .join(' | ');
    failures.push(
      [
        `EAS build already exists for ${platform}/${args.profile}/${args.commit}`,
        buildLines,
        `Reuse the build id or set HERMES_EAS_REBUILD_EXISTING=${REBUILD_APPROVAL} after an explicit rebuild checkpoint.`,
      ].join('; '),
    );
  }
}

function runSelfTest() {
  const parsed = parseBuildUsage(`
    EAS Build
      Builds (plan): 4,500/4,500 builds
      Builds (overage): 47 builds ($5.00)
  `);
  if (parsed.used !== 4500) throw new Error('self-test failed: used');
  if (parsed.limit !== 4500) throw new Error('self-test failed: limit');
  if (parsed.overageBuilds !== 47) throw new Error('self-test failed: overage builds');
  if (parsed.overageDollars !== 5) throw new Error('self-test failed: overage dollars');
  console.log('eas-build-guard self-test: PASS');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.platform || !args.profile) {
    usage();
    process.exit(2);
  }
  args.commit = args.commit || process.env.GITHUB_SHA || getCurrentCommit();

  const failures = [];
  checkUsage(args, failures);
  checkDuplicateBuild(args, failures);

  if (failures.length > 0) {
    console.error('Hermes EAS build guard: BLOCKED');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(2);
  }

  console.error(`Hermes EAS build guard: PASS (${normalizePlatform(args.platform)}/${args.profile}/${args.commit})`);

  if (args.dryRun || args.command.length === 0) {
    return;
  }

  const result = spawnSync(args.command[0], args.command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status == null ? 1 : result.status);
}

main();
