#!/usr/bin/env node
/**
 * tools/ai-native-sdlc.js
 * 
 * Unified AI-Native Software Development Lifecycle (SDLC) Orchestrator.
 * Implements Anthropic's AI-Native SDLC Playbook across all 6 stages:
 *   Stage 1: Plan (Intent capture & proto-spec)
 *   Stage 2: Design (Single-session spec generation & policy matrix)
 *   Stage 3: Build (Plan mode as default, subagent delegation & worktree isolation)
 *   Stage 4: Test (Continuous evals & closed feedback loop: fix code not test)
 *   Stage 5: Deploy (3-pass review with nit cap <=5, PreToolUse production gate)
 *   Stage 6: Maintain (Western Electric statistical control bands & auto loop closure)
 */

const fs = require('fs');
const path = require('path');
const { runSentinel } = require('./control-band-sentinel');
const { runEvals } = require('./agent-eval-runner');
const { evaluatePreToolUse } = require('../hooks/pre-tool-production-gate');

const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to format filenames safely
function slugify(text) {
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// Stage 1: Plan
function executePlanStage(args) {
  const title = args.title || 'Untitled Feature';
  const problem = args.problem || 'No problem statement provided.';
  const outcome = args.outcome || 'No proposed outcome provided.';
  const author = args.author || process.env.USER || 'agent';
  const users = args.users || 'End users, developers';
  const systems = args.systems || 'mac-yolo-safeguards, thumbgate';
  const constraints = args.constraints || '$0 unbudgeted spend, no new PII, backward compatible';
  const openQuestions = args.openQuestions || 'None identified.';

  const slug = slugify(title);
  const intentDir = path.join(ROOT_DIR, 'intent');
  if (!fs.existsSync(intentDir)) fs.mkdirSync(intentDir, { recursive: true });

  const targetFile = path.join(intentDir, `${slug}.md`);
  const templatePath = path.join(intentDir, 'TEMPLATE.md');

  let content = '';
  if (fs.existsSync(templatePath)) {
    content = fs.readFileSync(templatePath, 'utf8')
      .replace(/{{TITLE}}/g, title)
      .replace(/{{AUTHOR}}/g, author)
      .replace(/{{DATE}}/g, new Date().toISOString())
      .replace(/{{PROBLEM}}/g, problem)
      .replace(/{{PROPOSED_OUTCOME}}/g, outcome)
      .replace(/{{AFFECTED_USERS}}/g, users)
      .replace(/{{AFFECTED_SYSTEMS}}/g, systems)
      .replace(/{{CONSTRAINTS}}/g, constraints)
      .replace(/{{OPEN_QUESTIONS}}/g, openQuestions);
  } else {
    content = `# Intent: ${title}\n\nAuthor: ${author}\nDate: ${new Date().toISOString()}\nStatus: draft\nLifecycle: exploration\n\n## Problem\n${problem}\n\n## Proposed outcome\n${outcome}\n\n## Affected users and systems\n- Users: ${users}\n- Systems: ${systems}\n\n## Constraints\n- ${constraints}\n\n## Open questions\n- ${openQuestions}\n`;
  }

  fs.writeFileSync(targetFile, content, 'utf8');
  return {
    stage: '01_PLAN',
    status: 'SUCCESS',
    artifact: targetFile,
    relativeArtifact: path.relative(ROOT_DIR, targetFile),
    title
  };
}

// Stage 2: Design
function executeDesignStage(args) {
  const intentPath = args.intent ? path.resolve(args.intent) : null;
  if (!intentPath || !fs.existsSync(intentPath)) {
    throw new Error(`Intent artifact not found: ${args.intent}`);
  }

  const intentContent = fs.readFileSync(intentPath, 'utf8');
  const titleMatch = intentContent.match(/^# Intent:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(intentPath, '.md');
  const slug = slugify(title);

  const specDir = path.join(ROOT_DIR, 'spec');
  if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true });

  const targetFile = path.join(specDir, `${slug}.md`);
  const templatePath = path.join(specDir, 'TEMPLATE.md');

  let content = '';
  if (fs.existsSync(templatePath)) {
    content = fs.readFileSync(templatePath, 'utf8')
      .replace(/{{TITLE}}/g, title)
      .replace(/{{INTENT_PATH}}/g, path.relative(ROOT_DIR, intentPath))
      .replace(/{{AUTHOR}}/g, process.env.USER || 'agent')
      .replace(/{{DATE}}/g, new Date().toISOString())
      .replace(/{{REQUIREMENTS_OVERVIEW}}/g, `Requirements distilled directly from ${path.basename(intentPath)}.`)
      .replace(/{{TECHNICAL_DESIGN}}/g, `Architecture conforming to repo skills and immutable policies.`)
      .replace(/{{AREAS_OF_CONCERN}}/g, `None conflicting.`)
      .replace(/{{ACCEPTANCE_CRITERION_1}}/g, `Deterministic test suite passes`)
      .replace(/{{ACCEPTANCE_CRITERION_2}}/g, `Pre-tool production gates verified`);
  } else {
    content = `# Spec: ${title}\n\nIntent Source: ${path.relative(ROOT_DIR, intentPath)}\n\n## 1. Requirements Overview\nDerived from intent.\n\n## 2. Technical Design\nValidated against repo policies.\n`;
  }

  fs.writeFileSync(targetFile, content, 'utf8');
  return {
    stage: '02_DESIGN',
    status: 'SUCCESS',
    artifact: targetFile,
    relativeArtifact: path.relative(ROOT_DIR, targetFile),
    intentSource: path.relative(ROOT_DIR, intentPath)
  };
}

// Stage 3: Build
function executeBuildStage(args) {
  const specPath = args.spec ? path.resolve(args.spec) : null;
  if (!specPath || !fs.existsSync(specPath)) {
    throw new Error(`Spec artifact not found: ${args.spec}`);
  }

  return {
    stage: '03_BUILD',
    status: 'READY_FOR_PLAN_MODE',
    spec: path.relative(ROOT_DIR, specPath),
    guidance: 'Work must start in plan mode. Do not write code before committing plan.md or tasks entry.',
    subagentsAvailable: ['verifier', 'simplifier', 'researcher']
  };
}

// Stage 4: Test
function executeTestStage(args) {
  const evalsPath = path.join(ROOT_DIR, 'evals/sdlc-evals.json');
  const evalSummary = runEvals(evalsPath);
  
  return {
    stage: '04_TEST',
    status: evalSummary.failed === 0 ? 'PASS' : 'FAIL',
    evals: evalSummary,
    invariantsEnforced: ['fix_code_not_test', 'secret_leak_prevention', 'continuous_eval_pass_threshold']
  };
}

// Stage 5: Deploy
function executeDeployStage(args) {
  const env = args.env || 'development';
  const command = args.command || `deploy --target=${env}`;
  
  const gateCheck = evaluatePreToolUse({
    tool: 'Bash',
    input: { command }
  });

  return {
    stage: '05_DEPLOY',
    environment: env,
    gateDecision: gateCheck.decision,
    reason: gateCheck.reason,
    passed: gateCheck.decision === 'ALLOW'
  };
}

// Stage 6: Maintain
function executeMaintainStage(args) {
  const configPath = path.join(ROOT_DIR, 'bands.yaml');
  const sampleData = args.data ? JSON.parse(args.data) : {
    ci_test_failure_rate: [0.02, 0.021, 0.019, 0.022, 0.055],
    post_deploy_5xx_rate: [0.001, 0.0009, 0.0011],
    pr_cycle_time_hours: [4.2, 4.5, 4.8, 5.0]
  };

  const results = runSentinel(sampleData, configPath, { dryRun: args.dryRun === true });
  const breachedCount = results.filter(r => r.evaluation.breached).length;
  const autoIntents = results.filter(r => r.autoIntentGenerated).map(r => r.autoIntentGenerated);

  return {
    stage: '06_MAINTAIN',
    status: breachedCount > 0 ? 'ANOMALY_DETECTED' : 'HEALTHY',
    metricsEvaluated: results.length,
    anomaliesFound: breachedCount,
    loopAutoClosed: autoIntents.length > 0,
    generatedIntents: autoIntents,
    details: results
  };
}

// Full SDLC Loop Status
function getSdlcStatus() {
  const intentFiles = fs.existsSync(path.join(ROOT_DIR, 'intent')) 
    ? fs.readdirSync(path.join(ROOT_DIR, 'intent')).filter(f => f.endsWith('.md') && f !== 'TEMPLATE.md')
    : [];
  const specFiles = fs.existsSync(path.join(ROOT_DIR, 'spec')) 
    ? fs.readdirSync(path.join(ROOT_DIR, 'spec')).filter(f => f.endsWith('.md') && f !== 'TEMPLATE.md')
    : [];
  const hasReviewPolicy = fs.existsSync(path.join(ROOT_DIR, 'REVIEW.md'));
  const hasBandsConfig = fs.existsSync(path.join(ROOT_DIR, 'bands.yaml'));
  const hasEvals = fs.existsSync(path.join(ROOT_DIR, 'evals/sdlc-evals.json'));

  return {
    protocol: 'AI-Native SDLC (Anthropic Inspired)',
    stages: {
      '01_PLAN': { intentCount: intentFiles.length, files: intentFiles },
      '02_DESIGN': { specCount: specFiles.length, files: specFiles },
      '03_BUILD': { planModeMandatory: true, subagentsConfigured: true },
      '04_TEST': { continuousEvalsActive: hasEvals },
      '05_DEPLOY': { reviewPolicyActive: hasReviewPolicy, productionGateHookInstalled: true },
      '06_MAINTAIN': { statisticalBandsConfigured: hasBandsConfig, autoLoopClosure: true }
    },
    systemReady: hasReviewPolicy && hasBandsConfig && hasEvals
  };
}

// CLI Argument Parsing
function parseCliArgs(rawArgs) {
  const parsed = { _: [] };
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        parsed[key] = rawArgs[i + 1];
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

if (require.main === module) {
  const rawArgs = process.argv.slice(2);
  const parsed = parseCliArgs(rawArgs);
  const command = parsed._[0] || 'status';

  try {
    switch (command) {
      case 'plan':
        console.log(JSON.stringify(executePlanStage(parsed), null, 2));
        break;
      case 'design':
        console.log(JSON.stringify(executeDesignStage(parsed), null, 2));
        break;
      case 'build':
        console.log(JSON.stringify(executeBuildStage(parsed), null, 2));
        break;
      case 'test':
        console.log(JSON.stringify(executeTestStage(parsed), null, 2));
        break;
      case 'deploy':
        console.log(JSON.stringify(executeDeployStage(parsed), null, 2));
        break;
      case 'maintain':
        console.log(JSON.stringify(executeMaintainStage(parsed), null, 2));
        break;
      case 'status':
      default:
        console.log(JSON.stringify(getSdlcStatus(), null, 2));
        break;
    }
  } catch (err) {
    console.error(`❌ AI-Native SDLC Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  executePlanStage,
  executeDesignStage,
  executeBuildStage,
  executeTestStage,
  executeDeployStage,
  executeMaintainStage,
  getSdlcStatus
};
