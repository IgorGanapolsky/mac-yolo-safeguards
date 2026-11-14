#!/usr/bin/env node
'use strict';

/**
 * tools/revenue-decision-engine.js
 *
 * Answers one question from measured counts: "Where should the next
 * launch-effort hour go, and which funnel step is leaking most?"
 *
 * The data is tiny (hundreds of downloads, single-digit checkouts, zero paid),
 * so every number is a posterior with a credible interval, never a bare
 * point estimate, and the tool says "not enough data" when it cannot rank.
 *
 * Method (dependency-free):
 *   1. Ingest per-channel counts: visits -> downloads -> checkout opened -> paid.
 *   2. Beta-Binomial posterior per stage per channel. Prior Beta(1,1): uniform,
 *      the weakest honest prior; with n in single digits it keeps intervals wide.
 *   3. Thompson sampling over channels on expected paid per visit, which gives
 *      the effort split. Paid-given-checkout is shrunk toward the pooled rate
 *      (prior strength 2) because no channel has enough paid users alone.
 *   4. A small in-memory knowledge graph (channels, pages, offers, stages) whose
 *      edges carry observed counts and a source; the recommendation is read by
 *      walking the graph and cites the edges it used. tools/agentic-graphrag-safeguard.js
 *      builds a process-safety hub graph (PIDs, ports) that does not map to
 *      funnel data, so only the "graph as common factual ground" idea is reused.
 *
 * Usage:
 *   node tools/revenue-decision-engine.js [--text] [--input file.json]
 *        [--window-hours 24] [--seed 7] [--hours 10]
 *   Without --input it reads Stripe (read-only, via with-secrets) and GitHub (gh).
 *
 * Input JSON shape:
 *   { "window": "24h", "sources": {"visits":"...", ...},
 *     "channels": { "producthunt": {"visits":n|null,"downloads":n|null,"checkouts":n,"paid":n}, ... },
 *     "totals":   {"visits":n,"downloads":n,"checkouts":n,"paid":n}   (optional, pooled)
 *     "pages":    {"/": {"visits":n}, "/teams/": {"visits":n}}         (optional)
 *     "offers":   {"pro_guard": {"price":29,"checkouts":n,"paid":n}}   (optional)
 *     "notes":    ["not measured: ..."] }
 * Counts only: no emails, names or secrets are read or printed.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

const REPO = 'IgorGanapolsky/mac-yolo-safeguards';
const SECRET_NAME = 'MACYOLO_STRIPE_SETUP_KEY';
const CHANNELS = ['producthunt', 'hn', 'reddit', 'github_readme', 'direct', 'other'];
const STAGES = ['visit', 'download', 'checkout', 'paid'];
const STAGE_PAIRS = [
  ['visit', 'download', 'visits', 'downloads'],
  ['download', 'checkout', 'downloads', 'checkouts'],
  ['checkout', 'paid', 'checkouts', 'paid'],
];
const PRIOR = { a: 1, b: 1 };
const CI = 0.9;

// ---------- Beta math ----------

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) = Beta CDF. */
function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

function betaQuantile(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Posterior for k successes out of n trials under Beta(PRIOR). */
function posterior(k, n, prior = PRIOR) {
  const a = prior.a + k;
  const b = prior.b + (n - k);
  const tail = (1 - CI) / 2;
  return {
    k, n, alpha: a, beta: b,
    mean: a / (a + b),
    lo: betaQuantile(tail, a, b),
    hi: betaQuantile(1 - tail, a, b),
  };
}

// ---------- seeded sampling ----------

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function gammaSample(shape, rng) {
  if (shape < 1) return gammaSample(shape + 1, rng) * Math.pow(rng() || 1e-12, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSample(a, b, rng) {
  const x = gammaSample(a, rng), y = gammaSample(b, rng);
  return x / (x + y);
}

// ---------- normalize ----------

function num(v) { return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null; }

function normalizeInput(raw) {
  const warnings = [];
  const channels = {};
  for (const name of CHANNELS) {
    const c = (raw.channels && raw.channels[name]) || {};
    const row = { visits: num(c.visits), downloads: num(c.downloads), checkouts: num(c.checkouts), paid: num(c.paid) };
    // A numerator above its denominator means mismatched windows or tags: clamp, and say so.
    // Walk from the bottom of the funnel up, so raising one stage never breaks a pair already checked.
    for (const [from, to, fk, tk] of STAGE_PAIRS.slice().reverse()) {
      if (row[fk] !== null && row[tk] !== null && row[tk] > row[fk]) {
        warnings.push(`${name}: ${tk}=${row[tk]} exceeds ${fk}=${row[fk]} (different windows or tags); ${from}->${to} treated as ${row[tk]}/${row[tk]}`);
        row[fk] = row[tk];
      }
    }
    // No trustworthy visit count: checkouts exceed visits (or visits are unknown). Never clamp;
    // the channel gets no Thompson share and is listed as not measured.
    if (row.checkouts > 0 && (row.visits === null || row.checkouts > row.visits)) {
      warnings.push(`${name}: ${row.checkouts} checkout${row.checkouts === 1 ? '' : 's'}, visits unknown, website traffic isn't measured`);
      row.visits = null;
    }
    channels[name] = row;
  }
  const sum = (k) => {
    const vals = CHANNELS.map((n) => channels[n][k]).filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const t = raw.totals || {};
  const totals = {};
  for (const k of ['visits', 'downloads', 'checkouts', 'paid']) totals[k] = num(t[k]) !== null ? num(t[k]) : sum(k);
  return {
    window: raw.window || 'unknown',
    sources: raw.sources || {},
    channels, totals,
    pages: raw.pages || {},
    offers: raw.offers || {},
    notes: raw.notes || [],
    warnings,
  };
}

// ---------- graph ----------

function buildGraph(data) {
  const nodes = new Map();
  const edges = [];
  const node = (id, type) => { if (!nodes.has(id)) nodes.set(id, { id, type }); };
  const edge = (from, to, rel, count, of, source) => {
    if (count === null || count === undefined) return;
    edges.push({ id: `e${edges.length + 1}`, from, to, rel, count, of: of === undefined ? null : of, source });
  };
  for (const s of STAGES) node(`stage:${s}`, 'stage');
  const src = data.sources;
  for (const ch of CHANNELS) {
    const c = data.channels[ch];
    node(`channel:${ch}`, 'channel');
    edge(`channel:${ch}`, 'stage:visit', 'VISITS', c.visits, null, src.visits || 'unspecified');
    edge(`channel:${ch}`, 'stage:download', 'DOWNLOADS', c.downloads, c.visits, src.downloads || 'unspecified');
    edge(`channel:${ch}`, 'stage:checkout', 'CHECKOUTS', c.checkouts, c.visits, src.checkouts || 'unspecified');
    edge(`channel:${ch}`, 'stage:paid', 'PAID', c.paid, c.checkouts, src.paid || src.checkouts || 'unspecified');
  }
  for (const [page, p] of Object.entries(data.pages)) {
    node(`page:${page}`, 'page');
    edge(`page:${page}`, 'stage:visit', 'VISITS', num(p.visits), null, src.pages || 'unspecified');
  }
  for (const [offer, o] of Object.entries(data.offers)) {
    node(`offer:${offer}`, 'offer');
    edge('stage:checkout', `offer:${offer}`, 'CHECKOUT_FOR', num(o.checkouts), null, src.offers || src.checkouts || 'unspecified');
    edge(`offer:${offer}`, 'stage:paid', 'PAID', num(o.paid), num(o.checkouts), src.offers || src.checkouts || 'unspecified');
  }
  // Pooled stage-to-stage edges
  const T = data.totals;
  for (const [from, to, fk, tk] of STAGE_PAIRS) {
    if (T[fk] !== null && T[tk] !== null) {
      edge(`stage:${from}`, `stage:${to}`, 'CONVERTS', Math.min(T[tk], T[fk]), T[fk], 'pooled totals');
    }
  }
  return { nodes: [...nodes.values()], edges, edgesOf: (id) => edges.filter((e) => e.from === id || e.to === id) };
}

function cite(e) {
  return {
    edge: e.id, from: e.from, to: e.to, rel: e.rel, count: e.count, of: e.of, source: e.source,
  };
}

// ---------- analysis ----------

function stagePosteriors(row) {
  const out = {};
  for (const [from, to, fk, tk] of STAGE_PAIRS) {
    out[`${from}->${to}`] = row[fk] !== null && row[tk] !== null ? posterior(row[tk], row[fk]) : null;
  }
  return out;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

function thompson(data, { seed = 7, draws = 4000 } = {}) {
  const T = data.totals;
  // Pool only channels whose paid count is known, so unknown outcomes don't drag the rate toward zero.
  const known = CHANNELS.map((n) => data.channels[n]).filter((c) => c.paid !== null && c.checkouts !== null);
  const pool = known.length
    ? known.reduce((acc, c) => ({ paid: acc.paid + Math.min(c.paid, c.checkouts), co: acc.co + c.checkouts }), { paid: 0, co: 0 })
    : (T.paid !== null && T.checkouts !== null ? { paid: T.paid, co: T.checkouts } : null);
  const pooledPaid = pool ? (pool.paid + 1) / (pool.co + 2) : 0.5;
  const strength = 2;
  const prior = { a: strength * pooledPaid, b: strength * (1 - pooledPaid) };
  const eligible = CHANNELS.filter((n) => {
    const c = data.channels[n];
    return c.visits !== null && c.visits > 0 && c.checkouts !== null;
  });
  const rng = mulberry32(seed);
  const wins = Object.fromEntries(eligible.map((n) => [n, 0]));
  const samples = Object.fromEntries(eligible.map((n) => [n, []]));
  for (let i = 0; i < draws; i++) {
    let best = null, bestV = -1;
    for (const n of eligible) {
      const c = data.channels[n];
      const co = Math.min(c.checkouts, c.visits);
      const q1 = betaSample(PRIOR.a + co, PRIOR.b + c.visits - co, rng);
      // Unknown paid count is not zero paid: fall back to the pooled prior, no observed failures.
      const q2 = c.paid === null
        ? betaSample(prior.a, prior.b, rng)
        : betaSample(prior.a + Math.min(c.paid, co), prior.b + co - Math.min(c.paid, co), rng);
      const v = q1 * q2;
      samples[n].push(v);
      if (v > bestV) { bestV = v; best = n; }
    }
    wins[best] += 1;
  }
  const split = Object.fromEntries(CHANNELS.map((n) => [n, 0]));
  const intervals = {};
  for (const n of eligible) {
    split[n] = wins[n] / draws;
    const s = samples[n].slice().sort((a, b) => a - b);
    intervals[n] = { lo: percentile(s, (1 - CI) / 2), hi: percentile(s, 1 - (1 - CI) / 2), mean: s.reduce((a, b) => a + b, 0) / s.length };
  }
  return { eligible, split, intervals, prior, draws, seed };
}

function allOverlap(intervals) {
  const names = Object.keys(intervals);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = intervals[names[i]], b = intervals[names[j]];
      if (a.lo > b.hi || b.lo > a.hi) return false;
    }
  }
  return true;
}

/** Paid users lost at each stage if that stage converted perfectly, using pooled posterior means downstream. */
function leakiestStage(data) {
  const T = data.totals;
  const pairs = STAGE_PAIRS.filter(([, , fk, tk]) => T[fk] !== null && T[tk] !== null);
  const post = {};
  for (const [from, to, fk, tk] of pairs) post[`${from}->${to}`] = posterior(Math.min(T[tk], T[fk]), T[fk]);
  const rows = pairs.map(([from, to, fk, tk], i) => {
    const key = `${from}->${to}`;
    const p = post[key];
    // Every later stage must be measured; a missing one would silently count as 100% conversion.
    const later = STAGE_PAIRS.slice(STAGE_PAIRS.findIndex((sp) => sp[2] === fk) + 1);
    const downstream = later.every(([f, t]) => post[`${f}->${t}`])
      ? later.reduce((acc, [f, t]) => acc * post[`${f}->${t}`].mean, 1)
      : null;
    const lost = T[fk] * (1 - p.mean);
    return { stage: key, entering: T[fk], converted: Math.min(T[tk], T[fk]), posterior: p, expectedLostUsers: lost, downstreamRate: downstream, expectedLostPaid: downstream === null ? null : lost * downstream };
  });
  // Stages with a known lost-paid figure first, biggest loss first; unknown ones last.
  rows.sort((a, b) => (b.expectedLostPaid ?? -1) - (a.expectedLostPaid ?? -1));
  return rows;
}

function decide(rawInput, opts = {}) {
  const data = normalizeInput(rawInput);
  const graph = buildGraph(data);
  const perChannel = {};
  for (const n of CHANNELS) perChannel[n] = { counts: data.channels[n], stages: stagePosteriors(data.channels[n]) };
  const ts = thompson(data, opts);
  const leaks = leakiestStage(data);
  const leak = leaks[0] || null;
  const hours = opts.hours || 10;

  const rankable = ts.eligible.length >= 2 && !allOverlap(ts.intervals);
  const notEnough = ts.eligible.length < 2 || allOverlap(ts.intervals);
  let recommendation;
  let evidence = [];

  if (ts.eligible.length === 0) {
    recommendation = { verdict: 'not enough data to rank channels yet', action: 'No channel has visits measured. Restore the visit source (PostHog or referrers) and tag every link with ?from=.', channel: null };
  } else if (notEnough) {
    // Fastest way to collect data: push the channel that already delivers the most visits.
    const fastest = ts.eligible.slice().sort((a, b) => data.channels[b].visits - data.channels[a].visits)[0];
    recommendation = {
      verdict: 'not enough data to rank channels yet',
      action: `Spend the next hours where samples accumulate fastest: ${fastest} (${data.channels[fastest].visits} visits measured, the most). Tag every link with ?from= so checkouts are attributed.`,
      channel: fastest,
    };
    evidence = graph.edgesOf(`channel:${fastest}`).map(cite);
  } else {
    const top = ts.eligible.slice().sort((a, b) => ts.split[b] - ts.split[a])[0];
    recommendation = { verdict: 'ranked', action: `Put the next hours into ${top} (Thompson share ${(ts.split[top] * 100).toFixed(0)}%).`, channel: top };
    evidence = graph.edgesOf(`channel:${top}`).map(cite);
  }
  const leakEvidence = leak
    ? graph.edges.filter((e) => e.rel === 'CONVERTS' && `${e.from}->${e.to}` === `stage:${leak.stage.split('->')[0]}->stage:${leak.stage.split('->')[1]}`).map(cite)
    : [];

  const effortHours = {};
  for (const n of ts.eligible) effortHours[n] = Math.round(ts.split[n] * hours * 100) / 100;

  return {
    window: data.window,
    sources: data.sources,
    totals: data.totals,
    smallSampleWarning: 'Counts are tiny (single-digit checkouts, zero paid). Every rate below is a Bayesian posterior mean with a 90% credible interval, not a fact. Intervals that overlap mean the data cannot tell the channels apart.',
    prior: { family: 'Beta', alpha: PRIOR.a, beta: PRIOR.b, why: 'uniform prior, the weakest honest assumption; paid-given-checkout is shrunk to the pooled rate with strength 2' },
    channels: perChannel,
    thompson: { seed: ts.seed, draws: ts.draws, eligibleChannels: ts.eligible, effortSplit: ts.split, effortHours, hoursBudget: hours, expectedPaidPerVisit: ts.intervals },
    rankable,
    recommendation,
    leakiestStage: leak && { ...leak, evidence: leakEvidence },
    allStagesByExpectedLostPaid: leaks.map((l) => ({ stage: l.stage, expectedLostPaid: l.expectedLostPaid })),
    evidence,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    notes: data.notes,
    warnings: data.warnings,
  };
}

// ---------- text ----------

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function toText(r) {
  const lines = [];
  const T = r.totals;
  lines.push(`Data (${r.window}): visits ${T.visits === null ? 'not measured' : T.visits}, downloads ${T.downloads === null ? 'not measured' : T.downloads}, checkouts opened ${T.checkouts === null ? 'not measured' : T.checkouts}, paid ${T.paid === null ? 'not measured' : T.paid}. This is a very small sample, so read every rate as a range, not a fact.`);
  const l = r.leakiestStage;
  if (l) {
    const p = l.posterior;
    lines.push(`Leakiest step: ${l.stage.replace('->', ' to ')}, ${l.converted} of ${l.entering} got through (about ${pct(p.mean)}, 90% range ${pct(p.lo)} to ${pct(p.hi)}); ${l.expectedLostPaid === null ? 'extra paid users from a fix are unknown because a later stage is not measured' : `a perfect fix is an upper bound of about ${l.expectedLostPaid.toFixed(1)} extra paid users on these counts`}, and it mixes all-time downloads with 24h checkouts, so treat it as direction only. Evidence: ${l.evidence.map((e) => `${e.edge} ${e.count}/${e.of} (${e.source})`).join('; ') || 'pooled totals'}.`);
  } else {
    lines.push('Leakiest step: not enough measured stages to say.');
  }
  const t = r.thompson;
  if (t.eligibleChannels.length) {
    const parts = t.eligibleChannels.map((n) => {
      const c = r.channels[n].counts;
      return `${n} ${(t.effortSplit[n] * 100).toFixed(0)}% (${c.checkouts} checkouts, ${c.visits} visits measured)`;
    });
    lines.push(`Effort split by Thompson sampling (seed ${t.seed}, ${t.draws} draws): ${parts.join(', ')}.`);
  } else {
    lines.push('Effort split: no channel has measured visits, so none can be scored.');
  }
  lines.push(`Verdict: ${r.recommendation.verdict}. ${r.recommendation.action}`);
  if (r.evidence.length) {
    lines.push(`Graph evidence behind that: ${r.evidence.filter((e) => e.rel !== 'VISITS' || true).slice(0, 4).map((e) => `${e.edge} ${e.from} ${e.rel} ${e.count}${e.of !== null ? '/' + e.of : ''} [${e.source}]`).join('; ')}.`);
  }
  const gaps = [...r.notes, ...r.warnings];
  if (gaps.length) lines.push(`Not measured or inconsistent: ${gaps.slice(0, 4).join(' | ')}`);
  return lines.slice(0, 8).join('\n');
}

// ---------- live collection ----------

function mapChannel(tag) {
  const t = String(tag || '').toLowerCase();
  if (/(producthunt|product hunt|^ph$)/.test(t)) return 'producthunt';
  if (/(ycombinator|^hn$|hackernews|hacker news|show-?hn)/.test(t)) return 'hn';
  if (/reddit/.test(t)) return 'reddit';
  if (/github/.test(t) || /readme/.test(t)) return 'github_readme';
  if (t === '' || t === 'direct' || t === '(direct)') return 'direct';
  return 'other';
}

function run(cmd, args, timeout = 60000) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
}

const STRIPE_SCRIPT = `
const h={Authorization:"Bearer "+process.env.${SECRET_NAME}};
const since=Math.floor(Date.now()/1000)-(+process.argv[1])*3600;
(async()=>{const by={};let after=null;
for(let i=0;i<10;i++){
 const u="https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]="+since+(after?"&starting_after="+after:"");
 const r=await fetch(u,{headers:h});const j=await r.json();
 if(j.error){console.log(JSON.stringify({error:j.error.type||"stripe_error"}));return}
 for(const x of j.data||[]){const k=(x.client_reference_id||"untagged")+"|"+Math.round((x.amount_total||0)/100);
  by[k]=by[k]||{opened:0,paid:0};by[k].opened++;if(x.status==="complete"&&x.payment_status==="paid")by[k].paid++}
 if(!j.has_more)break;after=j.data[j.data.length-1].id}
console.log(JSON.stringify({by}))})()`;

/**
 * PostHog read through the signed-in BrowserOS over raw CDP (Playwright connectOverCDP is
 * unsupported there). Opens a background tab, runs one HogQL query from the page, closes it.
 */
async function queryPostHog(hogql, { port = process.env.BROWSEROS_CDP_PORT || '9119', projectId = '669292', settleMs = 6000 } = {}) {
  if (!/^\d+$/.test(String(projectId)) || !/^\d+$/.test(String(port))) throw new Error('projectId and port must be numeric');
  const WS = globalThis.WebSocket;
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WS(v.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const i = ++id;
    pend.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); const done = pend.get(m.id); if (done) { pend.delete(m.id); done(m); } };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error(`websocket to 127.0.0.1:${port} failed`)); });
  let tid;
  try {
    const t = await send('Target.createTarget', { url: `https://us.posthog.com/project/${projectId}/home`, background: true });
    tid = t.result && t.result.targetId;
    if (!tid) throw new Error(`createTarget failed: ${JSON.stringify(t.error || t).slice(0, 140)}`);
    const a = await send('Target.attachToTarget', { targetId: tid, flatten: true });
    const sid = a.result.sessionId;
    await new Promise((r) => setTimeout(r, settleMs));
    const expr = `(async()=>{const c=document.cookie.match(/posthog_csrftoken=([^;]+)/);const x=await fetch('/api/projects/'+${JSON.stringify(String(projectId))}+'/query/',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':c?c[1]:''},body:JSON.stringify({query:{kind:'HogQLQuery',query:${JSON.stringify(hogql)}}})});const j=await x.json();return JSON.stringify(j.results?{rows:j.results}:{error:'HTTP '+x.status})})()`;
    const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid);
    const val = ev.result && ev.result.result && ev.result.result.value;
    if (!val) throw new Error(`evaluate failed: ${JSON.stringify(ev).slice(0, 140)}`);
    const j = JSON.parse(val);
    if (j.error) throw new Error(`PostHog query ${j.error} (not signed in?)`);
    return j.rows;
  } finally {
    if (tid) await send('Target.closeTarget', { targetId: tid });
    ws.close();
  }
}

async function applyPostHog(raw, windowHours) {
  const port = process.env.BROWSEROS_CDP_PORT || '9119';
  try {
    const rows = await queryPostHog(`select coalesce(nullif(properties.from,''), nullif(properties.utm_source,''), nullif(properties.referrer,''), 'direct') as src, coalesce(properties.path,'?') as path, count() from events where event='pageview' and properties.product='macyolo' and timestamp > now() - interval ${windowHours} hour and coalesce(properties.utm_source,'') != 'agent_check' and coalesce(properties.likely_bot,false) = false group by 1,2 limit 200`);
    for (const n of CHANNELS) raw.channels[n].visits = 0;
    raw.pages = {};
    for (const [src, pth, count] of rows) {
      raw.channels[mapChannel(src)].visits += count;
      const key = pth === '/teams/' || pth === '/teams' ? '/teams/' : pth === '/' ? '/' : null;
      if (key) { raw.pages[key] = raw.pages[key] || { visits: 0 }; raw.pages[key].visits += count; }
    }
    raw.sources.visits = `PostHog pageview on the website by ?from=, last ${windowHours}h, bots excluded`;
    raw.sources.pages = raw.sources.visits;
    raw.window = `${windowHours}h (site visits, Stripe), all-time (downloads)`;
    raw.notes = raw.notes.map((n) => n.replace(/visits are 14-day; checkouts are \d+h, so stage ratios mix windows/, 'visits and checkouts are both '+windowHours+'h, so only the download stage mixes windows'));
  } catch (e) {
    raw.notes.push(`not measured: site visits by ?from= and by page (PostHog via BrowserOS port ${port}: ${String(e.message).split('\n')[0].slice(0, 160)}); visits fall back to GitHub repo referrers`);
  }
  return raw;
}

function collectLive({ windowHours = 24 } = {}) {
  const notes = [];
  const sources = {};
  const channels = Object.fromEntries(CHANNELS.map((n) => [n, { visits: null, downloads: null, checkouts: 0, paid: 0 }]));
  const offers = {};
  const totals = { visits: null, downloads: null, checkouts: 0, paid: 0 };

  // Stripe: read-only API through with-secrets; only counts leave the child process.
  try {
    const out = run('with-secrets', [SECRET_NAME, '--', process.execPath, '-e', STRIPE_SCRIPT, String(windowHours)]);
    const j = JSON.parse(out.trim().split('\n').pop());
    if (j.error) throw new Error(`Stripe API error type ${j.error}`);
    for (const [k, v] of Object.entries(j.by)) {
      const [tag, price] = k.split('|');
      const ch = mapChannel(tag === 'untagged' ? 'other' : tag);
      channels[ch].checkouts += v.opened;
      channels[ch].paid += v.paid;
      totals.checkouts += v.opened;
      totals.paid += v.paid;
      const offer = price === '29' ? 'pro_guard' : `offer_${price}usd`;
      offers[offer] = offers[offer] || { price: Number(price), checkouts: 0, paid: 0 };
      offers[offer].checkouts += v.opened;
      offers[offer].paid += v.paid;
    }
    sources.checkouts = `Stripe checkout sessions by client_reference_id, last ${windowHours}h`;
    sources.paid = sources.checkouts;
    sources.offers = sources.checkouts;
  } catch (e) {
    totals.checkouts = null; totals.paid = null;
    for (const n of CHANNELS) { channels[n].checkouts = null; channels[n].paid = null; }
    notes.push(`not measured: Stripe checkouts (${String(e.message).split('\n')[0].slice(0, 160)})`);
  }

  // GitHub referrers (14-day uniques) as channel visits.
  try {
    const ref = JSON.parse(run('gh', ['api', `repos/${REPO}/traffic/popular/referrers`]));
    for (const n of CHANNELS) channels[n].visits = 0;
    for (const r of ref) {
      const ch = mapChannel(r.referrer);
      channels[ch].visits += r.uniques;
    }
    sources.visits = 'GitHub traffic referrers, unique visitors, 14-day window (repo page only, not the website)';
  } catch (e) {
    notes.push(`not measured: GitHub referrers (${String(e.message).split('\n')[0].slice(0, 160)})`);
  }

  // Release downloads: all-time total, not attributable to a channel.
  try {
    const rel = JSON.parse(run('gh', ['api', `repos/${REPO}/releases`]));
    totals.downloads = rel.reduce((a, r) => a + (r.assets || []).reduce((s, x) => s + (x.download_count || 0), 0), 0);
    sources.downloads = 'GitHub release asset download_count, all-time, not split by channel';
    notes.push('downloads are all-time and unattributed; visits are 14-day; checkouts are ' + windowHours + 'h, so stage ratios mix windows');
  } catch (e) {
    notes.push(`not measured: release downloads (${String(e.message).split('\n')[0].slice(0, 160)})`);
  }

  return { window: `${windowHours}h (Stripe), 14d (visits), all-time (downloads)`, sources, channels, totals, offers, notes };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { text: false, input: null, windowHours: 24, seed: 7, hours: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--text') o.text = true;
    else if (a === '--input') o.input = argv[++i];
    else if (a === '--window-hours') o.windowHours = Number(argv[++i]);
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--hours') o.hours = Number(argv[++i]);
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) {
    process.stdout.write('Usage: revenue-decision-engine.js [--text] [--input file.json] [--window-hours 24] [--seed 7] [--hours 10]\n');
    return 0;
  }
  const raw = o.input ? JSON.parse(fs.readFileSync(o.input, 'utf8')) : await applyPostHog(collectLive({ windowHours: o.windowHours }), o.windowHours);
  const result = decide(raw, { seed: o.seed, hours: o.hours });
  process.stdout.write((o.text ? toText(result) : JSON.stringify(result, null, 2)) + '\n');
  return 0;
}

module.exports = { betaCdf, betaQuantile, posterior, mulberry32, betaSample, normalizeInput, buildGraph, thompson, allOverlap, leakiestStage, decide, toText, mapChannel, collectLive, queryPostHog, applyPostHog };

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
