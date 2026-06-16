#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards', 'media-ingest');

const usage = `Usage:
  node tools/media-content-ingest.js <url-or-file> [--out-dir dir] [--json] [--keep-temp]

Extract content from YouTube videos, podcast URLs, or local media files.

Autonomous order of operations:
1. collect metadata with yt-dlp when available
2. extract native/auto subtitles when available
3. transcribe downloaded audio only when a local transcriber is installed
4. emit a structured report and never pretend unavailable content was read`;

function parseArgs(argv) {
  const args = {
    input: '',
    outDir: DEFAULT_OUT_DIR,
    json: false,
    keepTemp: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out-dir') {
      args.outDir = requireValue(argv, ++i, '--out-dir');
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--keep-temp') {
      args.keepTemp = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!args.input) {
      args.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!args.help && !args.input) {
    throw new Error('input URL or file is required');
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 60000,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 16,
  });
}

function commandExists(command) {
  const result = run('sh', ['-c', 'command -v "$1"', 'sh', command], { timeout: 5000 });
  return result.status === 0;
}

function safeName(input) {
  return String(input)
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'media';
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function stripVtt(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed === 'WEBVTT') return false;
      if (/^Kind:|^Language:/.test(trimmed)) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d\d:\d\d:\d\d[.,]\d{3}\s+-->\s+\d\d:\d\d:\d\d[.,]\d{3}/.test(trimmed)) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function summarizeText(text, maxChars = 2400) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  if (maxChars <= 3) return '.'.repeat(Math.max(0, maxChars));
  return `${cleaned.slice(0, maxChars - 3).trim()}...`;
}

function buildActionPlan(text, metadata = {}) {
  const haystack = `${metadata.title || ''} ${text || ''}`.toLowerCase();
  const actions = [];
  const add = (lane, action, evidence) => actions.push({ lane, action, evidence });

  if (/niche|position|ideal customer|customer/.test(haystack)) {
    add('positioning', 'Write one sharp ICP/value sentence and test it against 20 target accounts.', 'media mentions niche, positioning, ideal customers, or customer focus');
  }
  if (/build|mvp|ship|prototype|product/.test(haystack)) {
    add('product', 'Convert the media lesson into one shippable Hermes improvement with a test and a PR.', 'media emphasizes building, MVPs, prototypes, or product craft');
  }
  if (/content|youtube|newsletter|linkedin|public|voice/.test(haystack)) {
    add('distribution', 'Publish one weekly build note: problem, shipped fix, proof, and what broke.', 'media emphasizes public learning, content, or voice');
  }
  if (/community|inner circle|discord|slack|telegram|relationship|dm/.test(haystack)) {
    add('customer-loop', 'Ask 5 ideal users for one painful automation failure and log answers as product evidence.', 'media emphasizes community, relationships, Telegram, or customer feedback');
  }
  if (/agent|automation|delegate|orchestrate|manager|ai to manage ai/.test(haystack)) {
    add('agent-os', 'Create a manager-agent task that turns each repo incident into issue, test, PR, and follow-up summary.', 'media emphasizes AI leverage, delegation, orchestration, or managing AI with AI');
  }
  if (/focus|daily|morning|time.block|top 3|outcome/.test(haystack)) {
    add('daily-os', 'Generate daily top-3 outcomes: one build, one distribution move, one relationship move.', 'media emphasizes focus, daily operating rhythm, or outcomes');
  }

  if (actions.length === 0) {
    add('triage', 'Extract one concrete product decision, one experiment, and one customer question from this media.', 'no high-confidence lane keywords matched');
  }
  return actions;
}

function getMetadata(input, runner = run) {
  const result = runner('yt-dlp', ['--dump-single-json', '--no-playlist', input], {
    timeout: 45000,
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || '').trim().slice(0, 1000),
    };
  }
  const raw = parseJson(result.stdout);
  if (!raw) {
    return { ok: false, error: 'yt-dlp returned non-JSON metadata' };
  }
  return {
    ok: true,
    raw,
    metadata: {
      title: raw.title || '',
      uploader: raw.uploader || raw.channel || '',
      duration: raw.duration || null,
      webpageUrl: raw.webpage_url || input,
      description: raw.description || '',
      categories: raw.categories || [],
      tags: raw.tags || [],
      uploadDate: raw.upload_date || '',
    },
  };
}

function findSubtitleFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => /\.(vtt|srt|ttml)$/i.test(file))
    .sort((a, b) => {
      const aScore = /(^|\.)(en|en-US|en-orig)\./i.test(a) ? 0 : 1;
      const bScore = /(^|\.)(en|en-US|en-orig)\./i.test(b) ? 0 : 1;
      return aScore - bScore || a.localeCompare(b);
    });
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

function extractSubtitles(input, tempDir, runner = run) {
  const outputTemplate = path.join(tempDir, 'subtitle.%(ext)s');
  const result = runner('yt-dlp', [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', 'en.*,en',
    '--sub-format', 'vtt/srt/ttml',
    '--no-playlist',
    '-o', outputTemplate,
    input,
  ], {
    timeout: 90000,
    maxBuffer: 1024 * 1024 * 16,
  });
  const subtitleFile = findSubtitleFile(tempDir);
  if (!subtitleFile) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || 'no subtitle file produced').trim().slice(0, 1000),
    };
  }
  const raw = fs.readFileSync(subtitleFile, 'utf8');
  const text = /\.vtt$/i.test(subtitleFile) ? stripVtt(raw) : raw.trim();
  return {
    ok: Boolean(text),
    file: subtitleFile,
    text,
    chars: text.length,
  };
}

function availableTranscriber(exists = commandExists) {
  if (exists('whisper')) return { command: 'whisper', kind: 'openai-whisper' };
  if (exists('mlx_whisper')) return { command: 'mlx_whisper', kind: 'mlx-whisper' };
  return null;
}

function downloadAudio(input, tempDir, runner = run) {
  const outputTemplate = path.join(tempDir, 'audio.%(ext)s');
  const result = runner('yt-dlp', [
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '-o', outputTemplate,
    input,
  ], {
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || '').trim().slice(0, 1000) };
  }
  const audio = fs.readdirSync(tempDir)
    .find((file) => /^audio\.(mp3|m4a|webm|opus|wav)$/i.test(file));
  if (!audio) return { ok: false, error: 'audio download completed but no audio file was found' };
  return { ok: true, file: path.join(tempDir, audio) };
}

function transcribeAudio(audioFile, tempDir, transcriber, runner = run) {
  if (!transcriber) return { ok: false, skipped: true, error: 'no local transcriber installed' };
  const args = transcriber.command === 'whisper'
    ? [audioFile, '--model', process.env.MEDIA_INGEST_WHISPER_MODEL || 'base', '--output_format', 'txt', '--output_dir', tempDir]
    : [audioFile, '--output-dir', tempDir];
  const result = runner(transcriber.command, args, {
    timeout: 600000,
    maxBuffer: 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || '').trim().slice(0, 1000) };
  }
  const txt = fs.readdirSync(tempDir).find((file) => /\.txt$/i.test(file));
  if (!txt) return { ok: false, error: 'transcriber completed but no .txt transcript was found' };
  const text = fs.readFileSync(path.join(tempDir, txt), 'utf8').trim();
  return { ok: Boolean(text), file: path.join(tempDir, txt), text, chars: text.length };
}

function writeReport(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}-${safeName(report.input)}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

function renderMarkdown(report) {
  const lines = [
    `# Media Ingest: ${report.metadata.title || report.input}`,
    '',
    `Input: ${report.input}`,
    `Status: ${report.status}`,
    `Source: ${report.source}`,
    '',
  ];
  if (report.metadata.title) lines.push(`Title: ${report.metadata.title}`);
  if (report.metadata.uploader) lines.push(`Uploader: ${report.metadata.uploader}`);
  if (report.metadata.duration) lines.push(`Duration seconds: ${report.metadata.duration}`);
  if (report.metadata.webpageUrl) lines.push(`URL: ${report.metadata.webpageUrl}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(report.summary || 'No transcript or description summary available.');
  lines.push('');
  if (report.transcript.text) {
    lines.push('## Transcript');
    lines.push('');
    lines.push(report.transcript.text);
    lines.push('');
  }
  if (report.errors.length > 0) {
    lines.push('## Extraction Notes');
    lines.push('');
    for (const error of report.errors) lines.push(`- ${error}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ingest(input, options = {}) {
  const runner = options.runner || run;
  const exists = options.commandExists || commandExists;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ingest-'));
  const report = {
    input,
    checkedAt: new Date().toISOString(),
    status: 'partial',
    source: 'none',
    metadata: {},
    transcript: { ok: false, text: '', chars: 0 },
    summary: '',
    actionPlan: [],
    artifacts: {},
    errors: [],
  };

  try {
    if (!exists('yt-dlp')) {
      report.status = 'blocked';
      report.errors.push('yt-dlp is not installed; cannot extract web media metadata or transcripts');
      return report;
    }

    const metadata = getMetadata(input, runner);
    if (metadata.ok) {
      report.metadata = metadata.metadata;
      report.source = 'metadata';
      report.summary = summarizeText(metadata.metadata.description);
    } else {
      report.errors.push(`metadata failed: ${metadata.error}`);
    }

    const subtitles = extractSubtitles(input, tempDir, runner);
    if (subtitles.ok) {
      report.status = 'ok';
      report.source = 'subtitles';
      report.transcript = { ok: true, text: subtitles.text, chars: subtitles.chars };
      report.summary = summarizeText(subtitles.text);
    } else {
      report.errors.push(`subtitle extraction failed: ${subtitles.error}`);
      const transcriber = availableTranscriber(exists);
      if (transcriber) {
        const audio = downloadAudio(input, tempDir, runner);
        if (audio.ok) {
          const transcript = transcribeAudio(audio.file, tempDir, transcriber, runner);
          if (transcript.ok) {
            report.status = 'ok';
            report.source = transcriber.kind;
            report.transcript = { ok: true, text: transcript.text, chars: transcript.chars };
            report.summary = summarizeText(transcript.text);
          } else {
            report.errors.push(`audio transcription failed: ${transcript.error}`);
          }
        } else {
          report.errors.push(`audio download failed: ${audio.error}`);
        }
      } else {
        report.errors.push('audio transcription skipped: no local whisper or mlx_whisper command found');
      }
    }

    if (report.source === 'metadata' && report.summary) {
      report.status = 'partial';
    } else if (report.source === 'none') {
      report.status = 'blocked';
    }
    report.actionPlan = buildActionPlan(`${report.summary}\n${report.transcript.text}\n${report.metadata.description || ''}`, report.metadata);
    return report;
  } finally {
    if (!options.keepTemp) removeDir(tempDir);
  }
}

function renderConsole(report) {
  console.log(`Status: ${report.status}`);
  console.log(`Source: ${report.source}`);
  if (report.metadata.title) console.log(`Title: ${report.metadata.title}`);
  if (report.metadata.webpageUrl) console.log(`URL: ${report.metadata.webpageUrl}`);
  if (report.transcript.ok) console.log(`Transcript chars: ${report.transcript.chars}`);
  if (report.summary) {
    console.log('');
    console.log(report.summary);
  }
  if (report.actionPlan.length > 0) {
    console.log('');
    console.log('Action plan:');
    for (const item of report.actionPlan) {
      console.log(`- ${item.lane}: ${item.action}`);
    }
  }
  if (report.errors.length > 0) {
    console.log('');
    console.log('Notes:');
    for (const error of report.errors) console.log(`- ${error}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = ingest(args.input, { keepTemp: args.keepTemp });
  report.artifacts = writeReport(report, args.outDir);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else renderConsole(report);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  parseArgs,
  stripVtt,
  summarizeText,
  buildActionPlan,
  safeName,
  availableTranscriber,
  ingest,
  getMetadata,
  extractSubtitles,
};
