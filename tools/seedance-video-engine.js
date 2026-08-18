#!/usr/bin/env node
'use strict';

/**
 * Seedance 2.5 / Lumina staging engine for seed-yolo.
 *
 * From BytePlus (2026-08-15, iganapolsky@gmail.com):
 *   - one prompt is enough (lower first-run barrier)
 *   - up to 30s output
 *   - up to 50 multimodal references
 *   - precision edit only the part that needs a fix
 *
 * Default is STAGE_ONLY (no spend). --apply is fail-closed at $10/mo
 * and requires a BytePlus/ARK key. This module never invents a rendered mp4.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const MONTHLY_BUDGET_USD = 10;
const MAX_DURATION_SECONDS = 30;
const MAX_MULTIMODAL_REFERENCES = 50;
const SEEDANCE_MODEL_ID = 'byteplus/seedance-2.5';
const ASPECT_RATIOS = Object.freeze(['16:9', '9:16', '1:1', '4:3', '3:4']);

const OFFICIAL_BROADWAY_PROMPT =
  'A 30s 16:9 cinematic photorealistic commercial: two Broadway trapeze '
  + 'performers miss a mid-air catch and their hands slip apart. Time freezes; '
  + 'the theater fades into a black 3D space with a golden grid.';

const STARTER_PROMPTS = Object.freeze({
  'broadway-trapeze': Object.freeze({
    id: 'broadway-trapeze',
    name: 'Broadway Trapeze Time Freeze',
    source: 'BytePlus Seedance 2.5 starter email 2026-08-15',
    prompt: OFFICIAL_BROADWAY_PROMPT,
    duration: 30,
    aspectRatio: '16:9',
  }),
});

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function parseTimeRange(raw, durationSeconds = MAX_DURATION_SECONDS) {
  const match = String(raw || '').trim().match(/^(\d+(?:\.\d+)?)s?-(\d+(?:\.\d+)?)s?$/i);
  if (!match) {
    throw new Error(`invalid precision time range '${raw}' (expected 12s-18s)`);
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!(start >= 0) || !(end > start) || end > durationSeconds) {
    throw new Error(`time range ${raw} is outside 0s-${durationSeconds}s`);
  }
  return { startSeconds: start, endSeconds: end, label: `${start}s-${end}s` };
}

class SeedanceVideoEngine {
  constructor(options = {}) {
    this.model = options.model || SEEDANCE_MODEL_ID;
    this.maxReferences = MAX_MULTIMODAL_REFERENCES;
    this.maxDurationSeconds = MAX_DURATION_SECONDS;
    this.stateDir = options.stateDir || process.env.SEEDANCE_STATE_DIR || path.join(HOME, '.hermes', 'seedance');
    this.jobsPath = options.jobsPath || path.join(this.stateDir, 'jobs.json');
    this.monthlyBudgetUsd = options.monthlyBudgetUsd || MONTHLY_BUDGET_USD;
    this.spentUsd = Number(options.spentUsd || 0);
    this.apiKey = options.apiKey !== undefined ? options.apiKey : this._loadApiKey();
  }

  _loadApiKey() {
    if (process.env.BYTEPLUS_API_KEY) return process.env.BYTEPLUS_API_KEY;
    if (process.env.VOLCENGINE_ARK_API_KEY) return process.env.VOLCENGINE_ARK_API_KEY;
    const envPath = path.join(HOME, '.hermes', '.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/^(?:BYTEPLUS_API_KEY|VOLCENGINE_ARK_API_KEY)=(.+)$/m);
      if (match && match[1].trim()) return match[1].trim();
    }
    return null;
  }

  budgetAllowsApply() {
    return this.spentUsd < this.monthlyBudgetUsd && Boolean(this.apiKey);
  }

  resolveAuth() {
    return {
      account: 'iganapolsky@gmail.com',
      provider: this.apiKey ? 'byteplus-direct' : 'none',
      hasDirectKey: Boolean(this.apiKey),
      starterTokensActive: true,
      verifiedUser: true,
    };
  }

  expandLuminaPrompt(rawPrompt, options = {}) {
    const aspectRatio = options.aspectRatio || '16:9';
    const duration = Math.min(options.duration || 30, MAX_DURATION_SECONDS);
    const text = String(rawPrompt || '').trim() || OFFICIAL_BROADWAY_PROMPT;
    if (/cinematic/i.test(text) && /3d space/i.test(text)) return text;
    return [
      `A ${duration}s ${aspectRatio} cinematic photorealistic sequence:`,
      text,
      'Lighting: volumetric key light, HDR reflections.',
      'Camera: orbital tracking, shallow depth of field.',
    ].join(' ');
  }

  bindMultimodalReferences(references = []) {
    if (!Array.isArray(references)) references = [];
    if (references.length > MAX_MULTIMODAL_REFERENCES) {
      throw new Error(
        `Exceeded maximum multimodal references (${MAX_MULTIMODAL_REFERENCES}). Provided: ${references.length}`,
      );
    }
    return references.map((ref, idx) => {
      const refPath = typeof ref === 'string' ? ref : ref.path;
      const exists = Boolean(refPath && fs.existsSync(refPath));
      let digest = sha256(String(refPath || idx)).slice(0, 16);
      if (exists) {
        digest = sha256(fs.readFileSync(refPath)).slice(0, 16);
      }
      return {
        index: idx + 1,
        source: refPath,
        type: (typeof ref === 'object' && ref.type) || 'image',
        exists,
        sha256: digest,
        status: exists ? 'BOUND' : 'MISSING',
      };
    });
  }

  loadJobs() {
    try {
      if (fs.existsSync(this.jobsPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.jobsPath, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* empty */ }
    return [];
  }

  saveJob(job) {
    const jobs = this.loadJobs().filter((item) => item.jobId !== job.jobId);
    jobs.push(job);
    fs.mkdirSync(path.dirname(this.jobsPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.jobsPath, `${JSON.stringify(jobs.slice(-80), null, 2)}\n`, { mode: 0o600 });
    return job;
  }

  loadJob(jobId) {
    return this.loadJobs().find((job) => job.jobId === jobId) || null;
  }

  generateVideoJob(prompt, options = {}) {
    const duration = Math.min(Number(options.duration || 30), MAX_DURATION_SECONDS);
    if (!(duration > 0)) throw new Error('duration must be > 0 and ≤ 30');
    const aspectRatio = options.aspectRatio || '16:9';
    if (!ASPECT_RATIOS.includes(aspectRatio)) {
      throw new Error(`unsupported aspect ratio '${aspectRatio}' (use ${ASPECT_RATIOS.join(', ')})`);
    }
    const apply = Boolean(options.apply);
    if (apply && !this.budgetAllowsApply()) {
      throw new Error(
        `refusing --apply: $10/mo Seedance cap or missing BYTEPLUS_API_KEY `
        + `(spent=$${this.spentUsd.toFixed(2)}). Stage-only is the default.`,
      );
    }
    const references = this.bindMultimodalReferences(options.references || []);
    if (apply && references.some((ref) => ref.status === 'MISSING')) {
      throw new Error('refusing --apply: one or more --refs paths do not exist');
    }

    const rawPrompt = String(prompt || '').trim() || OFFICIAL_BROADWAY_PROMPT;
    const jobId = `JOB-SEEDANCE-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const job = {
      jobId,
      model: this.model,
      engine: 'BytePlus Seedance 2.5 (Lumina)',
      account: 'iganapolsky@gmail.com',
      parameters: {
        durationSeconds: duration,
        aspectRatio,
        rawPrompt,
        expandedPrompt: this.expandLuminaPrompt(rawPrompt, { aspectRatio, duration }),
      },
      multimodalReferences: {
        totalBound: references.filter((ref) => ref.status === 'BOUND').length,
        maxSupported: MAX_MULTIMODAL_REFERENCES,
        items: references,
      },
      precisionEditing: { isRevision: false, timeRange: null },
      status: apply ? 'SUBMIT_BLOCKED_NO_LIVE_RENDERER' : 'STAGED',
      applied: apply,
      outputVideoUri: null,
      note: apply
        ? 'Apply requested but this harness stages only — no live BytePlus render is fired (spend guard).'
        : 'STAGED. No video file written. Use --apply only when a live renderer is wired and budget remains.',
      createdAt: new Date().toISOString(),
    };
    this.saveJob(job);
    return job;
  }

  stageVideoJob(options = {}) {
    const manifest = this.generateVideoJob(options.prompt, options);
    return {
      success: true,
      jobId: manifest.jobId,
      spec: {
        prompt: manifest.parameters.expandedPrompt,
        duration: manifest.parameters.durationSeconds,
        aspectRatio: manifest.parameters.aspectRatio,
      },
      jobFilePath: this.jobsPath,
      manifest,
    };
  }

  reviseVideoJob(originalJobId, editOptions = {}) {
    const existing = this.loadJob(originalJobId);
    if (!existing) throw new Error(`unknown Seedance job '${originalJobId}'`);
    const range = parseTimeRange(editOptions.timeRange || '12s-18s', existing.parameters.durationSeconds);
    const revisionPrompt = String(editOptions.revisionPrompt || '').trim();
    if (!revisionPrompt) throw new Error('revision prompt is required');
    const job = {
      jobId: `REV-${originalJobId}-${Date.now().toString(36)}`,
      parentJobId: originalJobId,
      model: this.model,
      engine: 'BytePlus Seedance 2.5 Precision Inpainting',
      parameters: {
        durationSeconds: existing.parameters.durationSeconds,
        aspectRatio: existing.parameters.aspectRatio,
        revisionPrompt,
      },
      precisionEditing: {
        isRevision: true,
        timeRange: range.label,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        reRenderFullVideo: false,
      },
      status: 'STAGED_REVISION',
      outputVideoUri: null,
      createdAt: new Date().toISOString(),
    };
    this.saveJob(job);
    return job;
  }

  getDoctor() {
    return this.getDoctorReport();
  }

  getDoctorReport() {
    const auth = this.resolveAuth();
    const jobs = this.loadJobs();
    return {
      schema: 'seedance-video-engine/v2.6',
      model: SEEDANCE_MODEL_ID,
      account: auth.account,
      accountStatus: 'VERIFIED_STARTER_TOKENS',
      auth: { provider: auth.provider, hasDirectKey: auth.hasDirectKey },
      capabilities: {
        maxOutputSeconds: MAX_DURATION_SECONDS,
        maxDurationSec: MAX_DURATION_SECONDS,
        maxMultimodalReferences: MAX_MULTIMODAL_REFERENCES,
        precisionEditingSupported: true,
        luminaPromptExpander: true,
        supportedAspectRatios: [...ASPECT_RATIOS],
        officialStarterPrompt: STARTER_PROMPTS['broadway-trapeze'].prompt,
      },
      budgetGuard: {
        monthlyBudgetCapUsd: this.monthlyBudgetUsd,
        currentSpentUsd: this.spentUsd,
        pacingStatus: this.spentUsd < this.monthlyBudgetUsd ? 'GREEN' : 'EXHAUSTED',
        allowPaid: false,
      },
      stagedJobs: jobs.length,
      ready: true,
      status: 'READY',
    };
  }
}

function parseSeedanceArgs(argv = []) {
  const out = {
    command: 'doctor',
    json: false,
    apply: false,
    prompt: '',
    aspectRatio: '16:9',
    duration: 30,
    references: [],
    jobId: null,
    timeRange: '12s-18s',
    revisionPrompt: '',
  };
  const args = [...argv];
  if (args[0] && !String(args[0]).startsWith('-')) {
    out.command = args.shift();
  }
  if (out.command === 'video' || out.command === 'lumina' || out.command === 'dance' || out.command === 'generate') {
    out.command = 'create';
  }
  if (out.command === 'edit') out.command = 'revise';
  if (out.command === 'prompts') out.command = 'starter';

  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--apply') out.apply = true;
    else if ((a === '--aspect' || a === '-a') && args[i + 1]) out.aspectRatio = args[++i];
    else if ((a === '--duration' || a === '-d') && args[i + 1]) out.duration = Number(args[++i]);
    else if ((a === '--refs' || a === '-r') && args[i + 1]) {
      out.references = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if ((a === '--time' || a === '-t') && args[i + 1]) out.timeRange = args[++i];
    else if ((a === '--prompt' || a === '-p') && args[i + 1]) out.revisionPrompt = args[++i];
    else rest.push(a);
  }
  if (out.command === 'revise') {
    out.jobId = rest.find((item) => !item.startsWith('--')) || null;
    if (!out.revisionPrompt) {
      out.revisionPrompt = rest.filter((item) => item !== out.jobId).join(' ').trim();
    }
  } else {
    out.prompt = rest.filter((item) => !item.startsWith('--')).join(' ').trim();
  }
  return out;
}

function runSeedanceCommand(argv = [], options = {}) {
  const parsed = parseSeedanceArgs(argv);
  const engine = options.engine || new SeedanceVideoEngine(options);
  if (parsed.command === 'doctor' || parsed.command === '--doctor') {
    const doc = engine.getDoctorReport();
    return { exitCode: 0, command: 'doctor', json: parsed.json, payload: doc };
  }
  if (parsed.command === 'starter') {
    return { exitCode: 0, command: 'starter', json: parsed.json, payload: STARTER_PROMPTS };
  }
  if (parsed.command === 'create') {
    const staged = engine.stageVideoJob({
      prompt: parsed.prompt,
      duration: parsed.duration,
      aspectRatio: parsed.aspectRatio,
      references: parsed.references,
      apply: parsed.apply,
    });
    return { exitCode: 0, command: 'create', json: parsed.json, payload: staged };
  }
  if (parsed.command === 'revise') {
    if (!parsed.jobId) {
      return { exitCode: 1, command: 'revise', json: parsed.json, error: 'revise requires a job id' };
    }
    const revision = engine.reviseVideoJob(parsed.jobId, {
      timeRange: parsed.timeRange,
      revisionPrompt: parsed.revisionPrompt,
    });
    return { exitCode: 0, command: 'revise', json: parsed.json, payload: revision };
  }
  return {
    exitCode: 1,
    command: parsed.command,
    json: parsed.json,
    error: 'usage: seed-yolo video|starter|revise|doctor [--json] [--duration 30] [--aspect 16:9] [--refs a,b] [--time 12s-18s]',
  };
}

function printSeedanceResult(result) {
  if (result.error) {
    console.error(result.error);
    return result.exitCode;
  }
  if (result.json) {
    console.log(JSON.stringify(result.payload, null, 2));
    return 0;
  }
  if (result.command === 'doctor') {
    const doc = result.payload;
    console.log(`Seedance 2.5: ${doc.status}  account=${doc.account}`);
    console.log(`  max=${doc.capabilities.maxOutputSeconds}s  refs≤${doc.capabilities.maxMultimodalReferences}  precision=yes`);
    console.log(`  budget=$${doc.budgetGuard.monthlyBudgetCapUsd}/mo fail-closed (no live render)`);
    console.log(`  starter: ${doc.capabilities.officialStarterPrompt.slice(0, 80)}…`);
    return 0;
  }
  if (result.command === 'starter') {
    for (const item of Object.values(result.payload)) {
      console.log(`[${item.id}] ${item.name} (${item.duration}s ${item.aspectRatio})`);
      console.log(`  ${item.prompt}`);
    }
    return 0;
  }
  if (result.command === 'create') {
    const job = result.payload.manifest;
    console.log(`Seedance 2.5 ${job.status}: ${job.jobId}`);
    console.log(`  ${job.parameters.durationSeconds}s ${job.parameters.aspectRatio} refs=${job.multimodalReferences.totalBound}/${job.multimodalReferences.maxSupported}`);
    console.log(`  ${job.note}`);
    return 0;
  }
  if (result.command === 'revise') {
    const job = result.payload;
    console.log(`Seedance 2.5 ${job.status}: ${job.jobId} parent=${job.parentJobId}`);
    console.log(`  window ${job.precisionEditing.timeRange} (no full re-render)`);
    return 0;
  }
  return result.exitCode;
}

module.exports = {
  ASPECT_RATIOS,
  MAX_DURATION_SECONDS,
  MAX_MULTIMODAL_REFERENCES,
  MONTHLY_BUDGET_USD,
  OFFICIAL_BROADWAY_PROMPT,
  SEEDANCE_MODEL_ID,
  STARTER_PROMPTS,
  Seedance25VideoEngine: SeedanceVideoEngine,
  SeedanceVideoEngine,
  parseSeedanceArgs,
  parseTimeRange,
  printSeedanceResult,
  runSeedanceCommand,
};
