#!/usr/bin/env node
'use strict';

/**
 * document-ingestion-health.js — rate + probe Document Ingestion across lanes.
 *
 * Stages (each: why / risks / measure + letter grade):
 *   parsing, ocr, deduplication, normalization, chunking, metadata,
 *   incremental_updates, reindexing, versioning
 *
 * Lanes: code (grepai), lessons (ThumbGate), harness (live walk),
 *        academic (hermes-academic-research-ingest), media (media-content-ingest)
 *
 * Usage:
 *   node tools/document-ingestion-health.js [--json] [--offline]
 * Exit: 0 if no critical stage is fail · 1 if any critical stage fails
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SEMANTIC_GREPAI = path.join(
  os.homedir(),
  '.hermes/semantic-index/mac-yolo-safeguards/.grepai',
);
const THUMBGATE_DIR = path.join(os.homedir(), '.thumbgate');

/** Static ratings grounded 2026-07-29 probes + playbook; probes may override status. */
const STAGES = [
  {
    id: 'parsing',
    name: 'Parsing',
    severity: 'critical',
    grade: 'B',
    why: 'Turn raw sources (source files, feedback, arXiv XML, media) into structured records retrieval can index.',
    risks: [
      'Lossy capture (actionable half missing)',
      'Wrong-field mapping breaks search/display',
      'Binary/media treated as text (noise embeddings)',
    ],
    measure: [
      'Field-completeness on lessons (howToAvoid/whatWentWrong non-empty)',
      'Round-trip capture → search contains original sentence',
      'Extension allowlists (harness TEXT_EXTENSIONS; academic allowed hosts)',
    ],
    lanes: {
      code: 'B+ Tree-sitter-aware chunking via grepai; plain text by extension',
      lessons: 'B free-text → structured fields; still accepts vague text',
      harness: 'A- read utf8 by extension; refuse non-text',
      academic: 'A- XML/HF metadata parse with host allowlist',
      media: 'B yt-dlp + subtitles/transcribe when tools exist; honest skip if not',
    },
  },
  {
    id: 'ocr',
    name: 'OCR (if needed)',
    severity: 'secondary',
    grade: 'N/A → C when used',
    why: 'Extract text from screenshots/PDFs when evidence is visual (computer-use path).',
    risks: [
      'Schema fields like visualEvidence stay null forever (dead weight)',
      'OCR garbage ranked as lessons',
      'Shipping images to cloud OCR (privacy)',
    ],
    measure: [
      '% records with visualEvidence non-null vs schema presence',
      'Local-only OCR path (Tesseract / Qwen-VL on isolated port) when computer-use runs',
    ],
    lanes: {
      code: 'N/A born-digital',
      lessons: 'N/A / unused — visualEvidence null in observed corpus',
      harness: 'N/A',
      academic: 'N/A metadata-only',
      media: 'C transcripts preferred; OCR not primary',
    },
  },
  {
    id: 'deduplication',
    name: 'Deduplication',
    severity: 'critical',
    grade: 'B−',
    why: 'One institutional fact, one retrieval unit — duplicates split signal and pollute rank.',
    risks: [
      '54 identical vague rules counted as "recurrences" instead of merged',
      'Import dedup ID/title+signal only → paraphrase dupes pass',
      'Near-dup needs embeddings (currently fake on lessons)',
    ],
    measure: [
      'canonicalHash collision rate merge vs new',
      'revisedFromId lineage fires on related captures',
      'Academic: digest + source-id ledger',
    ],
    lanes: {
      code: 'B+ content-hash / mtime skip in grepai watch',
      lessons: 'C+ hash+lineage exist; vague recurrence spam still lands',
      harness: 'A no index — no stale dups (re-read)',
      academic: 'A- source id + content digest',
      media: 'B output dir overwrite policy',
    },
  },
  {
    id: 'normalization',
    name: 'Normalization',
    severity: 'important',
    grade: 'B',
    why: 'Stable tokens, paths, dates, licenses so filters and eval substrings match.',
    risks: [
      'Path separator / case drift',
      'CamelCase vs compound identifier mismatch (fixed asymmetrically in harness)',
      'Timezone/date skew on research receipts',
    ],
    measure: [
      'Dual-tokenization unit tests on harness',
      'Academic normalize authors/tags/license in tests',
      'Eval fixture path substrings still resolve after renames',
    ],
    lanes: {
      code: 'B+ dual token path/text on harness; grepai own normalizer',
      lessons: 'B signal cleaners; domain tags inconsistent',
      academic: 'A- dedicated normalize path + fixture tests',
      media: 'B structured report schema',
    },
  },
  {
    id: 'chunking',
    name: 'Chunking',
    severity: 'critical',
    grade: 'B+',
    why: 'Index unit must match answer unit — too big dilutes, too small loses contract.',
    risks: [
      'Fixed 512/50 windows split functions',
      'Multi-incident lesson as one blob',
      'Harness whole-file score + 240KB truncate loses tail',
    ],
    measure: [
      'grepai chunk size/overlap config',
      'Lesson token histogram (flag >500)',
      'Harness best-window snippet tests',
    ],
    lanes: {
      code: 'B+ grepai 512/50 + Tree-sitter symbols',
      lessons: 'A- one lesson = one unit (right call)',
      harness: 'B whole-file score; best-window snippet; parent-child deferred',
      academic: 'A item-level (paper/card)',
      media: 'B segment by chapter/time when available',
    },
  },
  {
    id: 'metadata',
    name: 'Metadata',
    severity: 'critical',
    grade: 'C+',
    why: 'Filter/rerank without smarter models; scope gates to the right domain.',
    risks: [
      'Auto entity:Customer → global block gate (observed)',
      'domain:testing mislabels',
      'confidence:70 stamp + auto-capture-fallback junk',
      'Filter on dirty metadata institutionalizes noise',
    ],
    measure: [
      'Entity precision sample / week',
      'Gate patterns that are single generic entity → warn-only until human',
      'Doctor flags question-shaped promoted rules',
    ],
    lanes: {
      code: 'B path boosts/penalties in grepai config',
      lessons: 'C rich fields but polluted auto-tags',
      harness: 'B- path quality multipliers only',
      academic: 'A tags/license/authors',
      media: 'B title/channel/duration',
    },
  },
  {
    id: 'incremental_updates',
    name: 'Incremental updates',
    severity: 'critical',
    grade: 'B / F split',
    why: 'New lessons and commits must become searchable without full rebuild every time.',
    risks: [
      'Lexical immediate, semantic never (lessons)',
      'grepai watch stuck in Reused without flushing gob (observed empty for days)',
      'Multi-worktree fan-out indexes wrong trees',
    ],
    measure: [
      'index-lag: ledger count − FTS count − vector count',
      'grepai canary live results >0 on isolated clone',
      'watcher PID + last-updated timestamp',
    ],
    lanes: {
      code: 'B watch mtime + cache when healthy; F when 384-byte shell',
      lessons: 'F semantic; B lexical if FTS not drifted',
      harness: 'A always fresh (no index)',
      academic: 'B daily receipt / --force',
      media: 'B on-demand',
    },
  },
  {
    id: 'reindexing',
    name: 'Re-indexing',
    severity: 'important',
    grade: 'C+',
    why: 'Model/config changes (hybrid, chunk size, embedder) require rebuild.',
    risks: [
      'No `grepai index --rebuild` in 0.35 — operators follow dead runbooks',
      'Partial rebuild leaves hybrid config true on empty dense',
      'Full reindex hours under load',
    ],
    measure: [
      'Canary after rebuild',
      'Documented isolated-clone path only',
      'Config hybrid.enabled matches measured search mode',
    ],
    lanes: {
      code: 'C+ watch --background rebuild; canary fixed to cwd of index',
      lessons: 'D no first-class reindex in-repo (package-side)',
      harness: 'N/A',
      academic: 'B --force re-run',
    },
  },
  {
    id: 'versioning',
    name: 'Versioning',
    severity: 'important',
    grade: 'B+',
    why: 'Prove which corpus/index produced a decision; support supersede without silent clobber.',
    risks: [
      'No schemaVersion on JSONL until first breaking migration',
      'Index without git SHA of corpus',
      'revisedFromId unused if capture quality skips lineage',
    ],
    measure: [
      'audit-trail hash chain present',
      'revisedFromId on related captures',
      'research-rag receipts dated',
      'git SHA on semantic-index clone pull',
    ],
    lanes: {
      code: 'B git tree + index last-updated; weak index↔SHA binding',
      lessons: 'A- hash-chained audit + revisedFromId + promotedAt',
      academic: 'A receipts + digests',
      media: 'B output timestamps',
    },
  },
];

function parseArgs(argv) {
  const args = { json: false, offline: false, help: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--offline') args.offline = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function fileBytes(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return null;
  }
}

function probeGrepai() {
  const gob = path.join(SEMANTIC_GREPAI, 'index.gob');
  const bytes = fileBytes(gob);
  const localGob = path.join(REPO, '.grepai/index.gob');
  const localBytes = fileBytes(localGob);
  let status = 'fail';
  const evidence = [];
  if (bytes != null && bytes >= 10_000) {
    status = 'ok';
    evidence.push(`isolated index.gob ${bytes} bytes @ ${SEMANTIC_GREPAI}`);
  } else {
    evidence.push(`isolated index weak/missing bytes=${bytes}`);
  }
  if (localBytes != null && localBytes < 10_000) {
    evidence.push(
      `REPO .grepai/index.gob still ${localBytes} bytes — agents searching from multi-worktree checkout hit empty shell`,
    );
    if (status === 'ok') status = 'warn';
  }
  // live search from isolated project
  const probe = spawnSync(
    'grepai',
    ['search', 'retrieval harness', '--json', '--compact'],
    {
      cwd: path.dirname(SEMANTIC_GREPAI),
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  if (probe.status === 0) {
    try {
      const body = JSON.parse(probe.stdout);
      const n = (body.results || body.matches || []).length;
      evidence.push(`live search results=${n}`);
      if (n === 0 && status === 'ok') status = 'fail';
      if (n > 0 && status === 'fail' && bytes >= 10_000) status = 'ok';
    } catch {
      evidence.push('live search JSON parse failed');
    }
  } else {
    evidence.push(`live search exit=${probe.status}`);
  }
  return { status, evidence };
}

function probeLessons() {
  const doctor = path.join(REPO, 'tools/thumbgate-lessons-doctor.js');
  if (!fs.existsSync(doctor)) {
    return { status: 'unknown', evidence: ['thumbgate-lessons-doctor.js missing'] };
  }
  const run = spawnSync(process.execPath, [doctor, '--json'], {
    encoding: 'utf8',
    timeout: 20000,
  });
  try {
    const d = JSON.parse(run.stdout || '{}');
    return {
      status: d.ok ? 'ok' : 'fail',
      evidence: d.problems || [JSON.stringify(d).slice(0, 200)],
    };
  } catch {
    return {
      status: run.status === 0 ? 'ok' : 'fail',
      evidence: [(run.stdout || run.stderr || '').slice(0, 300)],
    };
  }
}

function probeHarness() {
  const evalScript = path.join(REPO, 'tools/rag-retrieval-eval.js');
  if (!fs.existsSync(evalScript)) {
    return { status: 'unknown', evidence: ['rag-retrieval-eval missing'] };
  }
  const run = spawnSync(process.execPath, [evalScript, '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  try {
    const d = JSON.parse(run.stdout);
    return {
      status: d.ok ? 'ok' : 'fail',
      evidence: [
        `harness eval ${d.passCount}/${d.caseCount} recall=${d.meanRecallAtK} mrr=${d.meanMrrAtK} ndcg=${d.meanNdcgAtK}`,
      ],
    };
  } catch {
    return { status: 'fail', evidence: [`eval parse fail exit=${run.status}`] };
  }
}

function probeAcademic() {
  const dir = path.join(os.homedir(), '.hermes/research-rag');
  if (!fs.existsSync(dir)) {
    return { status: 'warn', evidence: ['~/.hermes/research-rag absent (write-only corpus never created)'] };
  }
  const files = fs.readdirSync(dir);
  return {
    status: files.length ? 'warn' : 'warn',
    evidence: [
      `research-rag files=${files.length} — still no first-class consumer in agent loop (ingest without retrieve)`,
    ],
  };
}

function overallGrade(stages) {
  const map = { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0, 'N/A': null };
  let s = 0;
  let n = 0;
  for (const st of stages) {
    const g = String(st.grade).split(' ')[0];
    if (map[g] == null) continue;
    s += map[g];
    n += 1;
  }
  if (!n) return 'N/A';
  const avg = s / n;
  if (avg >= 3.7) return 'A-';
  if (avg >= 3.3) return 'B+';
  if (avg >= 3.0) return 'B';
  if (avg >= 2.7) return 'B-';
  if (avg >= 2.3) return 'C+';
  if (avg >= 2.0) return 'C';
  return 'C-';
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(`Usage: node tools/document-ingestion-health.js [--json] [--offline]

Rates Document Ingestion stages (parsing→versioning) across code/lessons/harness/academic/media.
Probes grepai isolated index, ThumbGate doctor, harness eval when not --offline.
`);
    process.exit(0);
  }

  const probes = {};
  if (!args.offline) {
    probes.code = probeGrepai();
    probes.lessons = probeLessons();
    probes.harness = probeHarness();
    probes.academic = probeAcademic();
  }

  // Map probes onto stages (coarse)
  const stageStatus = {};
  for (const st of STAGES) {
    let status = 'unknown';
    const evidence = [];
    if (args.offline) {
      status = 'skip';
      evidence.push('offline — static grade only');
    } else if (st.id === 'incremental_updates' || st.id === 'reindexing' || st.id === 'chunking') {
      status = probes.code?.status || 'unknown';
      evidence.push(...(probes.code?.evidence || []));
      if (probes.lessons) {
        evidence.push(...(probes.lessons.evidence || []).slice(0, 2));
        if (probes.lessons.status === 'fail' && status === 'ok') status = 'warn';
      }
    } else if (st.id === 'deduplication' || st.id === 'metadata' || st.id === 'parsing') {
      status = probes.lessons?.status === 'fail' ? 'fail' : probes.harness?.status || 'warn';
      evidence.push(...(probes.lessons?.evidence || []).slice(0, 3));
      evidence.push(...(probes.harness?.evidence || []).slice(0, 1));
    } else if (st.id === 'versioning') {
      status = 'ok';
      evidence.push('lessons audit lineage present when doctor runs; git for code');
      if (probes.lessons?.status === 'fail') {
        status = 'warn';
        evidence.push('FTS/embed lag means versions exist but search sees stale subset');
      }
    } else if (st.id === 'ocr') {
      status = 'ok';
      evidence.push('OCR not required for primary born-digital corpora');
    } else if (st.id === 'normalization') {
      status = probes.harness?.status || 'ok';
      evidence.push(...(probes.harness?.evidence || []));
    }
    stageStatus[st.id] = { status, evidence };
  }

  const payload = {
    asOf: new Date().toISOString(),
    overallGrade: overallGrade(STAGES),
    offline: args.offline,
    stages: STAGES.map((s) => ({
      ...s,
      probe: stageStatus[s.id],
    })),
    probes,
    criticalFails: STAGES.filter(
      (s) => s.severity === 'critical' && stageStatus[s.id]?.status === 'fail',
    ).map((s) => s.id),
  };
  payload.ok = payload.criticalFails.length === 0;

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`# Document Ingestion health · overall grade ${payload.overallGrade}`);
    console.log(`AS_OF=${payload.asOf}`);
    console.log('');
    console.log('| Stage | Grade | Probe | Why (one line) |');
    console.log('|-------|-------|-------|----------------|');
    for (const s of payload.stages) {
      const p = s.probe?.status || '?';
      console.log(`| ${s.name} | ${s.grade} | **${p}** | ${s.why.slice(0, 80)}… |`);
    }
    console.log('');
    for (const s of payload.stages) {
      console.log(`## ${s.name} (${s.grade})`);
      console.log(`- **Why:** ${s.why}`);
      console.log('- **Risks:**');
      for (const r of s.risks) console.log(`  - ${r}`);
      console.log('- **Measure:**');
      for (const m of s.measure) console.log(`  - ${m}`);
      if (s.probe?.evidence?.length) {
        console.log('- **Evidence now:**');
        for (const e of s.probe.evidence) console.log(`  - ${e}`);
      }
      console.log('');
    }
    console.log('## Commands');
    console.log('```bash');
    console.log('node tools/document-ingestion-health.js');
    console.log('node tools/grepai-index-canary.js --live');
    console.log('node tools/thumbgate-lessons-doctor.js');
    console.log('node tools/rag-retrieval-eval.js --json');
    console.log('```');
  }

  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(2);
  }
}

module.exports = { STAGES, overallGrade, parseArgs };
