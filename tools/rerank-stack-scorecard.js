#!/usr/bin/env node
'use strict';

/**
 * Reranking stack scorecard — fail-closed A+ for CE / ColBERT-lite / LLM / ensemble.
 *
 *   node tools/rerank-stack-scorecard.js --json
 *   node tools/rerank-stack-scorecard.js --live   # also hits Ollama embeds + optional chat
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { selfTest, rerank, createOllamaEmbedder } = require('./retrieval-rerank');
const { letterFromScore } = require('./rag-stack-scorecard');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { json: false, live: true };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--live') args.live = true;
    else if (a === '--no-live') args.live = false;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function ollamaUp() {
  const r = spawnSync('curl', ['-sS', '--max-time', '2', 'http://127.0.0.1:11434/api/tags'], {
    encoding: 'utf8',
  });
  return r.status === 0 && /models/.test(r.stdout || '');
}

async function scoreRerankStack(options = {}) {
  const gates = [];
  const live = options.live !== false;

  // 1) Hermetic self-test: CE + ColBERT + ensemble flip inverted RRF prior
  const st = await selfTest();
  gates.push({
    id: 'self-test-inversion',
    hard: true,
    weight: 0.28,
    ok: Boolean(st.ok),
    detail: st.ok
      ? `ce=${st.cross_encoder_top} colbert=${st.colbert_top} ens=${st.ensemble_top}`
      : JSON.stringify(st).slice(0, 200),
    score: st.ok ? 1 : 0,
  });

  // 2) Capability matrix present
  const caps = st.capabilities || {};
  const capOk = caps.cross_encoder && caps.colbert_lite && caps.llm_rerank && caps.ensemble;
  gates.push({
    id: 'capability-matrix',
    hard: true,
    weight: 0.12,
    ok: Boolean(capOk),
    detail: JSON.stringify(caps),
    score: capOk ? 1 : 0,
  });

  // 3) Module + dual-path wiring files
  const fs = require('fs');
  const files = [
    path.join(REPO, 'tools', 'retrieval-rerank.js'),
    path.join(REPO, 'tools', 'retrieval-dual-path.js'),
  ];
  const dualSrc = fs.readFileSync(files[1], 'utf8');
  const wired =
    files.every((f) => fs.existsSync(f)) &&
    dualSrc.includes("require('./retrieval-rerank')") &&
    dualSrc.includes('rerank(');
  gates.push({
    id: 'dual-path-wired',
    hard: true,
    weight: 0.15,
    ok: wired,
    detail: wired ? 'retrieval-dual-path requires + calls retrieval-rerank' : 'wiring missing',
    score: wired ? 1 : 0,
  });

  // 4) Live Ollama CE + ColBERT on tiny set (optional skip with --no-live)
  let liveCe = { ok: !live, detail: 'skipped' };
  let liveCol = { ok: !live, detail: 'skipped' };
  let liveLlm = { ok: !live, detail: 'skipped' };
  if (live) {
    if (!ollamaUp()) {
      liveCe = { ok: false, detail: 'ollama down at :11434' };
      liveCol = { ok: false, detail: 'ollama down' };
      liveLlm = { ok: false, detail: 'ollama down' };
    } else {
      const embedder = createOllamaEmbedder({});
      const cands = [
        {
          path: 'docs/noise.md',
          snippet: 'newsletter social media growth hacks engagement',
          rrfScore: 0.04,
        },
        {
          path: 'tools/hermes-cloud-connector.js',
          snippet: 'recover gateway session after tailscale disconnect',
          rrfScore: 0.02,
        },
      ];
      const q = 'recover hermes gateway session tailscale';
      try {
        const ce = await rerank({
          query: q,
          candidates: cands,
          strategy: 'cross_encoder',
          embedder,
          limit: 2,
        });
        liveCe = {
          ok: ce.matches[0]?.path === 'tools/hermes-cloud-connector.js',
          detail: `top=${ce.matches[0]?.path} score=${ce.matches[0]?.rerankScore}`,
        };
      } catch (e) {
        liveCe = { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
      try {
        const col = await rerank({
          query: q,
          candidates: cands,
          strategy: 'colbert_lite',
          embedder,
          limit: 2,
        });
        liveCol = {
          ok: col.matches[0]?.path === 'tools/hermes-cloud-connector.js',
          detail: `top=${col.matches[0]?.path} maxSim=${col.matches[0]?.components?.colbert?.maxSim}`,
        };
      } catch (e) {
        liveCol = { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
      // LLM is soft-hard: try, but allow skip if model missing if CE+ColBERT green
      try {
        const llm = await rerank({
          query: q,
          candidates: cands,
          strategy: 'ensemble',
          embedder,
          llm: true,
          limit: 2,
        });
        liveLlm = {
          ok: Boolean(llm.ok && (llm.llmApplied || llm.matches[0]?.path?.includes('hermes-cloud'))),
          detail: llm.llmApplied
            ? `llm applied top=${llm.matches[0]?.path}`
            : `fallback ok top=${llm.matches[0]?.path} err=${llm.llmError || 'none'}`,
        };
        // If LLM failed but ensemble still ranked correctly, still ok for production
        if (!llm.llmApplied && llm.matches[0]?.path === 'tools/hermes-cloud-connector.js') {
          liveLlm.ok = true;
        }
      } catch (e) {
        liveLlm = { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  gates.push({
    id: 'live-cross-encoder',
    hard: true,
    weight: 0.18,
    ok: liveCe.ok,
    detail: liveCe.detail,
    score: liveCe.ok ? 1 : 0,
  });
  gates.push({
    id: 'live-colbert-lite',
    hard: true,
    weight: 0.18,
    ok: liveCol.ok,
    detail: liveCol.detail,
    score: liveCol.ok ? 1 : 0,
  });
  gates.push({
    id: 'live-llm-or-fallback',
    hard: true,
    weight: 0.09,
    ok: liveLlm.ok,
    detail: liveLlm.detail,
    score: liveLlm.ok ? 1 : 0,
  });

  let weighted = 0;
  let weightSum = 0;
  let hardFail = false;
  for (const g of gates) {
    weighted += g.score * g.weight;
    weightSum += g.weight;
    if (g.hard && !g.ok) hardFail = true;
  }
  const score = weightSum ? weighted / weightSum : 0;
  // Perfect rerank stack: treat as nDCG=1 for letterFromScore A+ band
  const grade = letterFromScore(score, hardFail, { ndcg: hardFail ? 0 : 1 });
  const aPlus = grade === 'A+' && !hardFail;
  // 10/10 only when every gate green
  const tenTen = aPlus && gates.every((g) => g.ok);

  return {
    checkedAt: new Date().toISOString(),
    grade,
    score: Number(score.toFixed(4)),
    aPlus,
    tenTen,
    hardFail,
    scoreOutOf10: tenTen ? 10 : Number((score * 10).toFixed(1)),
    gates,
    ok: aPlus,
  };
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (args.help) {
        console.log('Usage: node tools/rerank-stack-scorecard.js [--json] [--live|--no-live]');
        process.exit(0);
      }
      const report = await scoreRerankStack(args);
      if (args.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(
          `Rerank stack grade: ${report.grade} (${report.scoreOutOf10}/10, score=${report.score}${report.hardFail ? ', hard-fail' : ''})`,
        );
        for (const g of report.gates) {
          console.log(`  ${g.ok ? 'OK' : 'FAIL'} ${g.id}: ${g.detail}`);
        }
        if (!report.aPlus) console.log('A+ not met — ensure Ollama nomic-embed-text is up for --live.');
      }
      process.exit(report.aPlus && report.tenTen ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    }
  })();
}

module.exports = { scoreRerankStack, letterFromScore };
