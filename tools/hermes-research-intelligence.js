#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');

const DEFAULT_RESEARCH_ITEMS = [
  {
    id: 'deepseek-deepspec',
    title: 'DeepSeek DeepSpec / DSpark speculative decoding',
    url: 'https://github.com/deepseek-ai/DeepSpec',
    confidence: 'repository_available',
    text: 'Speculative decoding uses a draft model and verifier model to increase throughput for long generation tasks.',
  },
  {
    id: 'llm-knowledge-base',
    title: 'Powerful LLM knowledge base',
    url: 'https://towardsdatascience.com/how-to-build-a-powerful-llm-knowledge-base/',
    confidence: 'operator_link_unverified',
    text: 'Build an LLM knowledge base with hybrid retrieval, dense vectors, metadata, and graph relationships.',
  },
  {
    id: 'claude-engineer-10x',
    title: 'How to 10x the 100x Claude engineer',
    url: 'https://dataengineeringcentral.substack.com/p/how-to-10x-the-100x-claude-engineer',
    confidence: 'operator_link_unverified',
    text: 'Improve agent engineering with deterministic validation loops, scoped task decomposition, and eval gates.',
  },
  {
    id: 'mlx-apple-silicon',
    title: 'Fine-tuning language models on Apple Silicon with MLX',
    url: 'https://www.kdnuggets.com/fine-tuning-language-models-on-apple-silicon-with-mlx',
    confidence: 'operator_link_unverified',
    text: 'MLX enables local Apple Silicon fine-tuning, but fine-tuning needs an eval set and enough labeled examples.',
  },
  {
    id: 'ornith-coding-models',
    title: 'DeepReinforce Ornith 1.0 coding models',
    url: 'https://www.testingcatalog.com/deepreinforce-releases-ornith-1-0-open-source-coding-models/',
    confidence: 'operator_link_unverified',
    text: 'New open coding models should enter the provider benchmark queue before they become defaults.',
  },
  {
    id: 'openrouter-status',
    title: 'OpenRouter model/provider availability signal',
    url: 'https://x.com/OpenRouter/status/2070955518772834479',
    confidence: 'x_link_unverified',
    text: 'Provider availability changes should update capability metadata and routing only after smoke tests and cost checks.',
  },
  {
    id: 'tom-doerr-x',
    title: 'Tom Doerr X engineering signal',
    url: 'https://x.com/tom_doerr/status/2070256559339294901',
    confidence: 'x_link_unverified',
    text: 'If this is about containerized Android emulators or reproducible mobile test environments, route it to the E2E portability gate.',
  },
  {
    id: 'hermes-agent-framework-paste',
    title: 'Operator-provided Hermes Agent Framework blueprint',
    url: 'operator-paste',
    confidence: 'operator_paste_unverified',
    text: 'Loop engineering, autonomous skill compilation, ingestion agents, hybrid vector graph RAG, and curator loops.',
  },
  {
    id: 'specification-driven-design',
    title: 'Specification-Driven Design for governed AI agent work',
    url: 'operator-pdf-audit',
    confidence: 'local_pdf_audit',
    text: 'Specification-Driven Design decomposes work into modular markdown specifications, governance guardrails, requirement traceability, DevOps/testing artifacts, and continuous gap analysis before execution.',
  },
];

const SIGNALS = [
  {
    key: 'specification-driven-design',
    label: 'Specification-Driven Design governance and gap-analysis lane',
    patterns: [
      /\bspecification[- ]driven design\b/i,
      /\bmodular markdown specifications?\b/i,
      /\bcontinuous gap analysis\b/i,
      /\brequirements? traceability\b/i,
      /\bgovernance\b/i,
      /\bguardrails?\b/i,
      /\bplanless execution\b/i,
      /\bsystem decomposition\b/i,
      /\bdevops\/testing artifacts?\b/i,
      /\bsecure,? production[- ]ready\b/i,
    ],
    roi: 10,
    impact: 'Turns ambiguous agent asks into source-backed specs, requirement-to-test traces, and explicit execution gates before code changes.',
    existingTools: [
      'tools/agent-decision-stack.js',
      'tools/hermes-retrieval-harness.js',
      'tools/hermes-self-harness.js',
      'tools/hermes-loop-state.js',
    ],
    action: 'Create or update a modular spec, retrieve local citations, map requirements to tests/gates, then execute only the bounded implementation lane.',
    verification: [
      'node tests/test-hermes-retrieval-harness.js',
      'node tests/test-hermes-research-intelligence.js',
      'node tools/hermes-loop-state.js --json --no-write',
    ],
    guardrail: 'require_spec_traceability_before_execution',
  },
  {
    key: 'hybrid-rag',
    label: 'Hybrid RAG and source-grounded knowledge base',
    patterns: [/\bhybrid\b/i, /\bknowledge base\b/i, /\bknowledge graph\b/i, /\bgraph rag\b/i, /\bvector\b/i, /\bdense\b/i, /\bmetadata\b/i],
    roi: 10,
    impact: 'Fewer stale-context mistakes across machines; faster cross-file decisions; better evidence for claims.',
    existingTools: ['tools/agent-decision-stack.js', 'tools/graphify-readiness.js', 'tools/hermes-source-packs.js'],
    action: 'Require graph/source-pack evidence before architecture, routing, revenue, or multi-machine claims.',
    verification: ['node tests/test-openrouter-graphify-tools.js', 'node tests/test-hermes-source-packs.js'],
    guardrail: 'read_only_until_recommendation',
  },
  {
    key: 'provider-capability-routing',
    label: 'Provider capability routing for OpenRouter, speculative decoding, and new coding models',
    patterns: [/\bopenrouter\b/i, /\bprovider\b/i, /\brouting\b/i, /\bspeculative decoding\b/i, /\bdspark\b/i, /\bdeepspec\b/i, /\bornith\b/i, /\bcoding model\b/i, /\bthroughput\b/i],
    roi: 9,
    impact: 'Routes long/code-heavy work to measured fast providers while keeping approvals and short actions local.',
    existingTools: ['tools/local-inference-readiness.js', 'tools/openrouter-reasoning-plan.js', 'tools/kimi-model-upgrade-audit.js', 'tools/glm52-hermes-config.js'],
    action: 'Benchmark provider candidates and update routing only when latency, context, cost, and smoke tests pass.',
    verification: ['node tests/test-openrouter-graphify-tools.js', 'node tests/test-kimi-model-upgrade-audit.js', 'node tests/test-glm52-hermes-config.js'],
    guardrail: 'benchmark_before_default',
  },
  {
    key: 'mlx-readiness',
    label: 'MLX Apple Silicon fine-tuning readiness',
    patterns: [/\bmlx\b/i, /\bapple silicon\b/i, /\bfine[- ]?tuning\b/i, /\blora\b/i, /\badapter\b/i, /\blabeled examples\b/i, /\beval set\b/i],
    roi: 7,
    impact: 'Can improve local specialist behavior, but only after retrieval and provider routing stop being the bottleneck.',
    existingTools: ['tools/local-inference-readiness.js', 'tools/tencentdb-memory-readiness.js'],
    action: 'Gate local MLX fine-tuning on enough labeled examples, an eval suite, and available RAM; otherwise use RAG/provider routing.',
    verification: ['node tests/test-tencentdb-memory-readiness.js'],
    guardrail: 'no_training_without_dataset_and_eval',
  },
  {
    key: 'guarded-skill-compilation',
    label: 'Guarded autonomous skill compilation',
    patterns: [/\bskill compilation\b/i, /\bskill document\b/i, /\bcurator\b/i, /\bself[- ]?improv/i, /\bloop engineering\b/i, /\bautonomous\b/i, /\bingestion agent\b/i, /\b24\/7\b/i],
    roi: 8,
    impact: 'Turns repeated research patterns into reusable capabilities without letting generated code overwrite operations.',
    existingTools: ['tools/hermes-source-packs.js', 'tools/hermes-self-harness.js', 'tools/hermes-governance-audit.js'],
    action: 'Emit skill candidates plus tests and governance findings; never auto-install generated skills from raw scraped text.',
    verification: ['node tests/test-hermes-source-packs.js', 'node tests/test-hermes-self-harness.js', 'node tests/test-hermes-governance-audit.js'],
    guardrail: 'candidate_only_until_tests_pass',
  },
  {
    key: 'android-e2e-portability',
    label: 'Reproducible Android E2E portability',
    patterns: [/\bandroid emulator\b/i, /\bdocker\b/i, /\bcontainer/i, /\be2e\b/i, /\bmaestro\b/i, /\bdevice farm\b/i, /\bmobile test\b/i],
    roi: 8,
    impact: 'Makes Hermes Mobile regressions reproducible across machines instead of depending on one plugged-in phone.',
    existingTools: ['hermes-mobile/scripts/run-continuous-e2e.sh', 'hermes-mobile/scripts/run-e2e.sh', 'tools/hermes-mobile-pair.js'],
    action: 'Add containerized or remote emulator only as a measured E2E lane after local Maestro proof defines selectors and artifacts.',
    verification: ['cd hermes-mobile && npm run e2e:continuous:once'],
    guardrail: 'do_not_touch_mobile_claims_without_file_ownership',
  },
];

function usage() {
  return `Usage:
  node tools/hermes-research-intelligence.js [--json] [--repo PATH] [--text TEXT] [--file PATH] [--no-defaults]

Scores operator-provided research links and text into Hermes improvements that
can be verified. It does not scrape forever, train models, publish, or install
generated skills.`;
}

function parseArgs(argv) {
  const args = { repo: DEFAULT_REPO, texts: [], files: [], json: false, defaults: true, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--text') args.texts.push(requireValue(argv, ++i, arg));
    else if (arg === '--file') args.files.push(path.resolve(requireValue(argv, ++i, arg)));
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-defaults') args.defaults = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function sourceItemsFromArgs(args) {
  const items = [];
  if (args.defaults) items.push(...DEFAULT_RESEARCH_ITEMS);
  args.texts.forEach((text, index) => {
    items.push({ id: `cli-text-${index + 1}`, title: `CLI text ${index + 1}`, url: 'cli-text', confidence: 'operator_text', text });
  });
  for (const filePath of args.files) {
    items.push({
      id: path.basename(filePath).replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      title: path.basename(filePath),
      url: filePath,
      confidence: 'local_file',
      text: fs.readFileSync(filePath, 'utf8'),
    });
  }
  return items;
}

function snippet(text, pattern) {
  const value = String(text || '');
  const match = value.match(pattern);
  if (!match || match.index == null) return '';
  const start = Math.max(0, match.index - 54);
  const end = Math.min(value.length, match.index + match[0].length + 54);
  return value.slice(start, end).replace(/\s+/g, ' ').trim();
}

function extractSignals(items) {
  return SIGNALS.map((signal) => {
    const matches = [];
    for (const item of items) {
      const text = `${item.title || ''}\n${item.text || ''}`;
      const matchedPatterns = signal.patterns.filter((pattern) => pattern.test(text));
      if (matchedPatterns.length === 0) continue;
      matches.push({
        itemId: item.id,
        title: item.title,
        url: item.url,
        confidence: item.confidence,
        matchedPatternCount: matchedPatterns.length,
        evidence: matchedPatterns.map((pattern) => snippet(text, pattern)).filter(Boolean).slice(0, 3),
      });
    }
    return {
      ...signal,
      matches,
      matchCount: matches.length,
      score: signal.roi + Math.min(5, matches.reduce((sum, match) => sum + match.matchedPatternCount, 0)),
    };
  }).filter((signal) => signal.matchCount > 0)
    .sort((a, b) => b.score - a.score || b.roi - a.roi || a.key.localeCompare(b.key));
}

function repoEvidence(repo) {
  const exists = (relativePath) => fs.existsSync(path.join(repo, relativePath));
  const claimedToolPaths = new Set(SIGNALS.flatMap((signal) => signal.existingTools));
  const presentTools = [...claimedToolPaths].filter((relativePath) => exists(relativePath));
  return {
    repo,
    graphBuilt: exists('graphify-out/graph.json'),
    graphReport: exists('graphify-out/GRAPH_REPORT.md'),
    sourcePacksTool: exists('tools/hermes-source-packs.js'),
    decisionStackTool: exists('tools/agent-decision-stack.js'),
    localInferenceTool: exists('tools/local-inference-readiness.js'),
    openRouterPlanTool: exists('tools/openrouter-reasoning-plan.js'),
    tailscaleDiscoveryTool: exists('tools/hermes-discover-tailscale-macs.js'),
    continuousE2eScript: exists('hermes-mobile/scripts/run-continuous-e2e.sh'),
    presentTools,
    missingTools: [...claimedToolPaths].filter((relativePath) => !exists(relativePath)),
  };
}

function buildRecommendation(signal, evidence) {
  const presentTools = signal.existingTools.filter((relativePath) => evidence.presentTools.includes(relativePath));
  const missingTools = signal.existingTools.filter((relativePath) => !evidence.presentTools.includes(relativePath));
  const ready = missingTools.length === 0;
  const stage = ready && signal.guardrail !== 'do_not_touch_mobile_claims_without_file_ownership'
    ? 'implement_now'
    : ready
      ? 'verify_existing_lane_first'
      : 'blocked_missing_tooling';
  return {
    key: signal.key,
    label: signal.label,
    score: signal.score,
    roi: signal.roi,
    stage,
    impact: signal.impact,
    action: signal.action,
    guardrail: signal.guardrail,
    matchedSources: signal.matches.map((match) => ({
      title: match.title,
      url: match.url,
      confidence: match.confidence,
    })),
    evidence: {
      presentTools,
      missingTools,
      matchCount: signal.matchCount,
      graphBuilt: evidence.graphBuilt,
    },
    verification: signal.verification,
  };
}

function buildBrief(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const items = options.items || DEFAULT_RESEARCH_ITEMS;
  const evidence = repoEvidence(repo);
  const recommendations = extractSignals(items).map((signal) => buildRecommendation(signal, evidence));
  return {
    checkedAt: new Date().toISOString(),
    repo,
    sourceCount: items.length,
    sources: items.map((item) => ({ id: item.id, title: item.title, url: item.url, confidence: item.confidence })),
    evidence,
    recommendations,
    summary: {
      recommendationCount: recommendations.length,
      implementNowCount: recommendations.filter((item) => item.stage === 'implement_now').length,
      guardedCount: recommendations.filter((item) => item.stage !== 'implement_now').length,
      topKeys: recommendations.slice(0, 5).map((item) => item.key),
      noDeadCodeRule: 'Only act where an existing tool, guardrail, and verification command exist.',
    },
  };
}

function render(brief) {
  const lines = [];
  lines.push('# Hermes Research Intelligence');
  lines.push('');
  lines.push(`Checked: ${brief.checkedAt}`);
  lines.push(`Sources scored: ${brief.sourceCount}`);
  lines.push(`Graph built: ${brief.evidence.graphBuilt ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## High-ROI Actions');
  for (const item of brief.recommendations) {
    lines.push(`- ${item.score}/15 ${item.label} [${item.stage}]`);
    lines.push(`  Action: ${item.action}`);
    lines.push(`  Guardrail: ${item.guardrail}`);
    lines.push(`  Evidence: ${item.evidence.presentTools.length} existing tool(s), ${item.evidence.missingTools.length} missing, ${item.evidence.matchCount} source match(es)`);
    lines.push(`  Verify: ${item.verification.join(' && ')}`);
  }
  lines.push('');
  lines.push(`No-dead-code rule: ${brief.summary.noDeadCodeRule}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const brief = buildBrief({ repo: args.repo, items: sourceItemsFromArgs(args) });
  if (args.json) console.log(JSON.stringify(brief, null, 2));
  else process.stdout.write(render(brief));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_RESEARCH_ITEMS,
  SIGNALS,
  buildBrief,
  extractSignals,
  parseArgs,
  render,
  repoEvidence,
  sourceItemsFromArgs,
};
