'use strict';

/**
 * multi-agent-pipeline.js — multi-agent pipeline with three production guards
 * derived from the TDS "Why I Stopped Using One Agent" pattern:
 *
 *   1. retry ceiling         — a `rebuild -> critique` loop CANNOT run forever.
 *                              After `maxRetries` failing critiques, the pipeline
 *                              surfaces its best attempt and stops (no infinite loop).
 *   2. failure_source        — every failed agent records WHICH agent failed and why,
 *                              so debugging attributes the root cause instead of
 *                              blind retries.
 *   3. independent critic    — the critic agent runs with an EMPTY history. It never
 *                              sees the generator's scratchpad / chain-of-thought, so
 *                              it cannot anchor to / rationalize the output it reviews.
 *
 * This module is framework-free and fully testable. An `Agent` is just an object
 * with a unique `key` and an async `run(state) -> { output, ok, reason }` function.
 *
 * Usage (CLI):
 *   node tools/multi-agent-pipeline.js --task "..." --json
 *
 * Usage (library):
 *   const { runPipeline, parseArgs, buildState } = require('./tools/multi-agent-pipeline');
 */

/**
 * Build the initial pipeline state. Modelled on the TDS PipelineState but with the
 * two missing fields added: retry_count ceiling and failure_source attribution.
 *
 * @param {string} userTask
 * @param {object} [opts]
 * @returns {object}
 */
function buildState(userTask, opts) {
  opts = opts || {};
  if (typeof userTask !== 'string' || userTask.trim() === '') {
    throw new Error('userTask is required and must be a non-empty string');
  }
  return {
    userTask,
    intents: null,
    schemaMapping: null,
    generatedQuery: null,
    critique: null,
    finalResponse: null,
    // GUARD 1: hard retry ceiling, non-negotiable. Prevents infinite rebuild loops.
    retryCount: 0,
    maxRetries: typeof opts.maxRetries === 'number' ? opts.maxRetries : 3,
    // GUARD 2: which agent caused the most recent failure, and why.
    failureSource: null,
    // Append-only trace of every agent invocation, for debugging + tests.
    trace: [],
  };
}

/**
 * Record an agent step in the trace and attribute failures.
 * Pure helper — returns a new state, does not mutate.
 */
function recordStep(state, agentKey, result, stage) {
  const entry = {
    agent: agentKey,
    stage,
    ok: !!result.ok,
    reason: result.reason || null,
    ts: new Date().toISOString(),
  };
  const next = Object.assign({}, state, { trace: state.trace.concat([entry]) });
  if (!result.ok) {
    // GUARD 2: attribute the failure to the specific agent + reason.
    next.failureSource = { agent: agentKey, reason: result.reason || 'unknown', stage };
  } else {
    next.failureSource = null;
  }
  return next;
}

/**
 * GUARD 3: Build the critic's context. By default the critic receives ONLY the
 * generated artifact + original task — NOT the generator's history/scratchpad.
 * This is the core fix for "the model anchors to what it just wrote".
 *
 * Returns a frozen snapshot so a buggy critic cannot mutate the real state.
 */
function buildCriticContext(state) {
  return Object.freeze({
    userTask: state.userTask,
    intents: state.intents,
    schemaMapping: state.schemaMapping,
    generatedQuery: state.generatedQuery,
    // Deliberately NO `trace`, NO generator reasoning, NO prior failed drafts.
  });
}

/**
 * Run a single agent. Wraps `agent.run` so that thrown errors become structured
 * failures attributed to that agent (GUARD 2) rather than crashing the pipeline.
 */
async function invokeAgent(agent, payload) {
  if (!agent || typeof agent.run !== 'function') {
    return { ok: false, reason: `agent "${agent && agent.key}" has no run() function` };
  }
  try {
    const result = await agent.run(payload);
    if (result && result.ok) return result;
    return { ok: false, reason: (result && result.reason) || `${agent.key} returned without ok` };
  } catch (err) {
    // Attribute the throw to this agent, don't crash the whole pipeline.
    return { ok: false, reason: `${agent.key} threw: ${err && err.message ? err.message : String(err)}` };
  }
}

/**
 * The retry-decision edge. Mirrors the TDS `should_retry` but adds the
 * GUARD 1 max-retries check as the FIRST condition.
 *
 *   - critique passed            -> 'respond'
 *   - retryCount >= maxRetries   -> 'respond' (surface best effort, STOP)
 *   - otherwise                  -> 'rebuild'
 */
function shouldRetry(state) {
  const critique = state.critique || {};
  if (critique.passed) return 'respond';
  // GUARD 1: hard ceiling. Without this, a pipeline that keeps failing critique
  // loops indefinitely.
  if (state.retryCount >= state.maxRetries) return 'respond';
  return 'rebuild';
}

/**
 * Run the full pipeline. `agents` = { intentParser, schema, queryBuilder, critic, responder }.
 * Each is an Agent: { key, run(payload) -> { ok, output, reason } }.
 *
 * Returns { ok, state, failureSource }.
 */
async function runPipeline(agents, userTask, opts) {
  const required = ['intentParser', 'schema', 'queryBuilder', 'critic', 'responder'];
  for (const k of required) {
    if (!agents || !agents[k]) throw new Error(`agents.${k} is required`);
  }

  let state = buildState(userTask, opts);

  // Stage 1: intent parse
  let r = await invokeAgent(agents.intentParser, { userTask: state.userTask });
  state = recordStep(state, agents.intentParser.key, r, 'intent');
  if (!r.ok) return { ok: false, state, failureSource: state.failureSource };
  state.intents = r.output;

  // Stage 2: schema map
  r = await invokeAgent(agents.schema, { userTask: state.userTask, intents: state.intents });
  state = recordStep(state, agents.schema.key, r, 'schema');
  if (!r.ok) return { ok: false, state, failureSource: state.failureSource };
  state.schemaMapping = r.output;

  // Build -> critique loop, bounded by GUARD 1.
  // Loop invariants: rebuild at most maxRetries+1 times.
  let lastError = null;
  // hard stop counter protects against any unforeseen runaway even if
  // shouldRetry logic were tampered with.
  const hardStop = state.maxRetries + 2;
  let iterations = 0;
  for (;;) {
    iterations += 1;
    if (iterations > hardStop) {
      state.failureSource = {
        agent: 'orchestrator',
        reason: `hard stop exceeded (${iterations} > ${hardStop})`,
        stage: 'loop-guard',
      };
      return { ok: false, state, failureSource: state.failureSource };
    }

    // Build query
    r = await invokeAgent(agents.queryBuilder, {
      userTask: state.userTask,
      intents: state.intents,
      schemaMapping: state.schemaMapping,
      retryCount: state.retryCount,
      // Previous failure feedback is passed so the builder can actually fix the
      // draft — this is NOT the critic's independent context, this is the
      // builder's own repair signal.
      previousFailure: lastError,
    });
    state = recordStep(state, agents.queryBuilder.key, r, 'build');
    if (!r.ok) return { ok: false, state, failureSource: state.failureSource };
    state.generatedQuery = r.output;

    // GUARD 3: critic runs on a PRISTINE context — only task + generated artifact.
    const criticCtx = buildCriticContext(state);
    r = await invokeAgent(agents.critic, criticCtx);
    state = recordStep(state, agents.critic.key, r, 'critique');
    if (!r.ok) return { ok: false, state, failureSource: state.failureSource };
    state.critique = r.output;

    const route = shouldRetry(state);
    if (route === 'respond') break;

    // route === 'rebuild'
    state.retryCount += 1;
    lastError = state.critique && state.critique.reason ? state.critique.reason : 'critique failed';
  }

  // Final: respond (best effort if critique never passed).
  r = await invokeAgent(agents.responder, {
    userTask: state.userTask,
    generatedQuery: state.generatedQuery,
    critique: state.critique,
    retryCount: state.retryCount,
    maxRetries: state.maxRetries,
  });
  state = recordStep(state, agents.responder.key, r, 'respond');
  if (!r.ok) return { ok: false, state, failureSource: state.failureSource };
  state.finalResponse = r.output;

  const critiquePassed = !!(state.critique && state.critique.passed);
  return { ok: critiquePassed, state, failureSource: critiquePassed ? null : state.failureSource };
}

/**
 * CLI parseArgs. Supports --task, --max-retries, --json, --demo, --help.
 * The --demo flag runs a built-in self-contained example so the tool is
 * runnable end-to-end without external deps.
 */
function parseArgs(argv) {
  const args = { task: '', maxRetries: 3, json: false, demo: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--task') { args.task = argv[++i] || ''; }
    else if (a === '--max-retries') {
      const n = parseInt(argv[++i], 10);
      if (Number.isNaN(n) || n < 0) throw new Error('--max-retries must be a non-negative integer');
      args.maxRetries = n;
    }
  }
  return args;
}

// ---- Demo agents (for --demo and as reference shapes) -----------------------

function makeDemoAgents(opts) {
  opts = opts || {};
  // When forceFail is set, the critic ALWAYS rejects — used to exercise the
  // retry ceiling (GUARD 1) and failure_source attribution (GUARD 2).
  const forceFail = !!opts.forceFail;
  // forceSchemaFail makes the schema agent fail once, to test failure attribution
  // to a non-builder agent.
  const schemaFails = opts.schemaFails || 0;
  let schemaAttempts = 0;

  const intentParser = {
    key: 'intent_parser',
    async run(p) {
      return { ok: true, output: { raw: p.userTask, intents: ['count_users'] } };
    },
  };
  const schema = {
    key: 'schema_agent',
    async run(p) {
      schemaAttempts += 1;
      if (schemaAttempts <= schemaFails) {
        return { ok: false, reason: 'schema_agent: could not resolve table for intent (transient)' };
      }
      return { ok: true, output: { count_users: { table: 'users', column: 'id' } } };
    },
  };
  const queryBuilder = {
    key: 'query_builder',
    async run(p) {
      // produce a valid-looking query; include retry signal in output so the
      // critic can observe the builder actually changed the draft on rebuild.
      const tag = p.retryCount > 0 ? ` /*retry ${p.retryCount}*/` : '';
      return { ok: true, output: `SELECT COUNT(*) FROM users${tag};` };
    },
  };
  const critic = {
    key: 'critic',
    async run(ctx) {
      // GUARD 3 check (verified in tests): ctx must NOT carry trace/history.
      if (ctx.trace !== undefined || ctx.retryCount !== undefined || ctx.failureSource !== undefined) {
        return { ok: false, reason: 'critic saw non-independent context (anchoring risk)' };
      }
      if (forceFail) {
        return { ok: true, output: { passed: false, reason: 'critic: forced rejection' } };
      }
      const ok = typeof ctx.generatedQuery === 'string' && ctx.generatedQuery.indexOf('SELECT') === 0;
      return {
        ok: true,
        output: ok
          ? { passed: true }
          : { passed: false, reason: 'critic: query does not start with SELECT' },
      };
    },
  };
  const responder = {
    key: 'responder',
    async run(p) {
      return {
        ok: true,
        output: {
          query: p.generatedQuery,
          accepted: !!(p.critique && p.critique.passed),
          retriesUsed: p.retryCount,
          surfacedBestEffort: !(p.critique && p.critique.passed),
        },
      };
    },
  };
  return { intentParser, schema, queryBuilder, critic, responder };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/multi-agent-pipeline.js --task "<task>" [--max-retries N] [--demo] [--json]\n'
      + '  --demo   run a self-contained example pipeline\n',
    );
    return 0;
  }
  if (args.demo || !args.task) {
    // Run a successful demo by default so the tool is always runnable.
    const agents = makeDemoAgents({ forceFail: false });
    const demoTask = args.task || 'Count active users from the users table';
    const out = await runPipeline(agents, demoTask, { maxRetries: args.maxRetries });
    const payload = {
      ok: out.ok,
      task: demoTask,
      critiquePassed: !!(out.state.critique && out.state.critique.passed),
      retriesUsed: out.state.retryCount,
      failureSource: out.failureSource,
      finalResponse: out.state.finalResponse,
      trace: out.state.trace,
    };
    process.stdout.write((args.json ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)) + '\n');
    return out.ok ? 0 : 1;
  }
  // Non-demo: in a real wiring, agents would call an LLM/provider here. Without
  // one configured we emit a structured "not wired" result rather than fake output.
  const payload = {
    ok: false,
    task: args.task,
    note: 'No LLM agents wired for live mode. Use --demo for a self-contained run, or import runPipeline() and pass your own agents.',
  };
  process.stdout.write((args.json ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)) + '\n');
  return 1;
}

module.exports = {
  buildState,
  recordStep,
  buildCriticContext,
  invokeAgent,
  shouldRetry,
  runPipeline,
  parseArgs,
  makeDemoAgents,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => { process.stderr.write(`multi-agent-pipeline: ${err.message}\n`); process.exit(1); });
}
