#!/usr/bin/env node
'use strict';

/**
 * local-coding-model-selector
 *
 * Hardware-aware selector for local AI coding models (Qwen3, GLM-5.3, etc.).
 * Inspired by the KDnuggets article "Run Qwen3.8-27B as a Local AI Coding Agent
 * in Just 3 Commands" which emphasizes checking VRAM/RAM before selecting a model.
 *
 * Unlike tools/local-media-route.js (which handles media: image/TTS/STT),
 * this tool handles *coding* workloads — which need much more VRAM for long
 * context windows and agentic tool use.
 *
 * Usage:
 *   node tools/local-coding-model-selector.js detect --json
 *     Detect hardware (VRAM, RAM, disk) + probe Ollama for installed models.
 *   node tools/local-coding-model-selector.js recommend --json
 *     Detect hardware, then recommend which local coding models can run.
 *   node tools/local-coding-model-selector.js recommend --vram 24 --ram 64 --disk 200 --json
 *     Recommend using explicit hardware values (for testing/CI).
 *   node tools/local-coding-model-selector.js models --json
 *     Print the model registry (requirements table).
 *
 * Design: pure functions for recommendation logic (testable without hardware);
 *         detection functions are separate and injectable for testing.
 */

const http = require('http');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// --- Model Registry ---------------------------------------------------------
// Requirements are conservative lower bounds from real-world Ollama usage.
// Apple Silicon: VRAM is unified/shared with system RAM — use RAM as the
// primary gate. Intel discrete GPU: VRAM is the primary gate.

const MODELS = [
  {
    id: 'qwen3:8b',
    name: 'Qwen3-8B',
    size_gb: 5,
    min_ram_gb: 16,
    min_vram_gb: 6,
    min_disk_gb: 5,
    description: 'Lightweight coding assistant; fits on most Macs',
    apple_silicon_ok: true,
  },
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    size_gb: 6,
    min_ram_gb: 16,
    min_vram_gb: 8,
    min_disk_gb: 8,
    description: 'ZAI coding plan model ($0 marginal); strong tool use',
    apple_silicon_ok: true,
  },
  {
    id: 'qwen3:30b-a3b',
    name: 'Qwen3-30B-A3B',
    size_gb: 18,
    min_ram_gb: 32,
    min_vram_gb: 18,
    min_disk_gb: 20,
    description: 'Mixture-of-experts; good balance of size and quality',
    apple_silicon_ok: true,
  },
  {
    id: 'qwen3:27b',
    name: 'Qwen3-27B',
    size_gb: 18,
    min_ram_gb: 32,
    min_vram_gb: 18,
    min_disk_gb: 18,
    description: 'High-quality coding agent; the article recommendation',
    apple_silicon_ok: false, // requires 32GB RAM minimum on Apple Silicon
  },
];

// Export for testing
exports.MODELS = MODELS;

// --- Hardware Detection -----------------------------------------------------

/**
 * Detect VRAM in GB from system_profiler.
 * Returns null if VRAM cannot be determined (e.g., Apple Silicon where
 * VRAM is shared with system RAM).
 */
function detectVRAM() {
  try {
    const output = execSync('system_profiler SPDisplaysDataType -json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000,
    });
    const data = JSON.parse(output);
    const displays = data.SPDisplaysDataType || [];
    for (const d of displays) {
      if (d.spdisplays_vram) {
        const m = d.spdisplays_vram.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
        if (m) {
          const val = parseFloat(m[1]);
          return m[2].toUpperCase() === 'GB' ? val : val / 1024;
        }
      }
    }
  } catch (e) {
    // system_profiler may not be available on non-macOS
  }
  return null;
}

/**
 * Detect total system RAM in GB.
 */
function detectRAM() {
  return os.totalmem() / (1024 ** 3);
}

/**
 * Detect available disk space in GB for the drive holding the given path.
 */
function detectDisk(path) {
  const p = path || os.homedir();
  try {
    const stat = fs.statSync(p);
    const check = stat.isDirectory() ? p : path.dirname(p);
    const sf = fs.statSync(check);
    // On macOS, use statfsSync for free space
    const fsStat = require('fs').statfsSync(check);
    return (fsStat.bavail * fsStat.bsize) / (1024 ** 3);
  } catch (e) {
    return null;
  }
}

/**
 * Detect CPU architecture.
 */
function detectArch() {
  return os.machine() || os.arch();
}

/**
 * Detect whether the system has an Apple Silicon chip.
 */
function detectAppleSilicon() {
  return detectArch() === 'arm64';
}

// Export for testing
exports._detect = {
  vram: detectVRAM,
  ram: detectRAM,
  disk: detectDisk,
  arch: detectArch,
  appleSilicon: detectAppleSilicon,
};

// --- Ollama Probe -----------------------------------------------------------

const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

/**
 * Probe Ollama for installed models.
 * Returns { ok: boolean, url: string, models: string[], error?: string }
 */
function probeOllama(url) {
  return new Promise((resolve) => {
    const target = url || OLLAMA_DEFAULT;
    const req = http.get(`${target}/api/tags`, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const models = (data.models || []).map((m) => m.name || m);
          resolve({ ok: true, url: target, models });
        } catch (e) {
          resolve({ ok: false, url: target, models: [], error: `JSON parse error: ${e.message}` });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ ok: false, url: target, models: [], error: e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, url: target, models: [], error: 'timeout (3s)' });
    });
  });
}

exports.probeOllama = probeOllama;

// --- Recommendation Engine (pure function) ----------------------------------

/**
 * Recommend which local coding models can run on the given hardware.
 *
 * @param {Object} hardware - { ram_gb, vram_gb, disk_gb, apple_silicon }
 * @returns {Object} { ok, hardware, recommended, warnings, all_models }
 */
function recommendModels(hardware) {
  const ram = parseFloat(hardware.ram_gb);
  const vram = hardware.vram_gb != null ? parseFloat(hardware.vram_gb) : null;
  const disk = parseFloat(hardware.disk_gb);
  const isAppleSilicon = Boolean(hardware.apple_silicon);

  const recommended = [];
  const warnings = [];

  if (ram < 8) {
    warnings.push('RAM below 8GB — no local model recommended. Use cloud.');
  }

  if (disk < 5) {
    warnings.push('Less than 5GB disk space — cannot install any model.');
  }

  for (const model of MODELS) {
    // RAM check is the universal gate
    if (ram < model.min_ram_gb) {
      continue;
    }

    // Apple Silicon: VRAM is shared with RAM, so skip VRAM gate
    if (isAppleSilicon) {
      // For Apple Silicon, model must be marked as Apple-Silicon compatible
      if (!model.apple_silicon_ok && ram < 64) {
        // Qwen3-27B only usable on M-series with 64GB+ RAM on Apple Silicon
        continue;
      }
      recommended.push({
        id: model.id,
        name: model.name,
        size_gb: model.size_gb,
        reason: `Apple Silicon with ${ram}GB RAM (VRAM shared)`,
        description: model.description,
      });
    } else {
      // Intel/AMD with discrete GPU: check VRAM
      if (vram != null && vram >= model.min_vram_gb) {
        recommended.push({
          id: model.id,
          name: model.name,
          size_gb: model.size_gb,
          reason: `VRAM ${vram}GB >= ${model.min_vram_gb}GB required`,
          description: model.description,
        });
      } else if (vram != null && vram < model.min_vram_gb && ram >= model.min_ram_gb * 1.5) {
        // Can offload to RAM (slower but works)
        recommended.push({
          id: model.id,
          name: model.name,
          size_gb: model.size_gb,
          reason: `VRAM ${vram}GB < ${model.min_vram_gb}GB but ${ram}GB RAM allows GPU+RAM offload`,
          description: model.description,
          offload: true,
          warning: 'Model will be partly in VRAM, partly in system RAM (slower)',
        });
      }
    }

    // Disk check
    if (disk < model.min_disk_gb) {
      const existing = recommended[recommended.length - 1];
      if (existing) {
        existing.disk_warning = `Only ${disk}GB disk available; model needs ${model.min_disk_gb}GB`;
      }
    }
  }

  // Sort by size (smallest first = most compatible)
  recommended.sort((a, b) => a.size_gb - b.size_gb);

  if (recommended.length === 0) {
    warnings.push(`No local model fits this hardware (RAM ${ram}GB, VRAM ${vram || 'N/A'} GB, disk ${disk}GB). Use cloud models.`);
  }

  return {
    ok: true,
    hardware: { ram_gb: ram, vram_gb: vram, disk_gb: disk, apple_silicon: isAppleSilicon },
    recommended,
    warnings,
    model_count: MODELS.length,
  };
}

exports.recommendModels = recommendModels;

// --- CLI --------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0] || 'help';
  const json = args.includes('--json');
  const asArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };

  if (cmd === 'models') {
    if (json) {
      console.log(JSON.stringify({ models: MODELS }, null, 2));
    } else {
      console.log('Local coding models (model registry):');
      for (const m of MODELS) {
        console.log(`  ${m.id.padEnd(16)} ${m.name.padEnd(16)} ${m.size_gb}GB  RAM≥${m.min_ram_gb}GB  ${m.description}`);
      }
    }
    return 0;
  }

  if (cmd === 'detect') {
    const hardware = {
      ram_gb: detectRAM(),
      vram_gb: detectVRAM(),
      disk_gb: detectDisk(),
      apple_silicon: detectAppleSilicon(),
      arch: detectArch(),
    };
    probeOllama().then((ollama) => {
      if (json) {
        console.log(JSON.stringify({ hardware, ollama }, null, 2));
      } else {
        console.log('Hardware:');
        console.log(`  RAM: ${hardware.ram_gb.toFixed(1)} GB`);
        console.log(`  VRAM: ${hardware.vram_gb != null ? hardware.vram_gb.toFixed(1) + ' GB' : 'N/A (Apple Silicon shared)'} `);
        console.log(`  Disk: ${hardware.disk_gb != null ? hardware.disk_gb.toFixed(1) + ' GB' : 'N/A'}`);
        console.log(`  Arch: ${hardware.arch} (${hardware.apple_silicon ? 'Apple Silicon' : 'Intel/AMD'})`);
        console.log(`  Ollama: ${ollama.ok ? `${ollama.models.length} models installed at ${ollama.url}` : `Not running (${ollama.error})`}`);
        if (ollama.ok && ollama.models.length > 0) {
          console.log(`  Models: ${ollama.models.join(', ')}`);
        }
      }
    });
    return 0; // async probe — exit code reflects detection, not probe
  }

  if (cmd === 'recommend') {
    const vramArg = asArg('--vram');
    const ramArg = asArg('--ram');
    const diskArg = asArg('--disk');
    const asArgFlag = asArg('--apple-silicon');

    let hardware;
    if (vramArg || ramArg || diskArg) {
      // Explicit override (for testing/CI)
      hardware = {
        ram_gb: ramArg ? parseFloat(ramArg) : detectRAM(),
        vram_gb: vramArg ? parseFloat(vramArg) : detectVRAM(),
        disk_gb: diskArg ? parseFloat(diskArg) : detectDisk(),
        apple_silicon: asArgFlag ? asArgFlag === 'true' || asArgFlag === 'yes' : detectAppleSilicon(),
      };
    } else {
      hardware = {
        ram_gb: detectRAM(),
        vram_gb: detectVRAM(),
        disk_gb: detectDisk(),
        apple_silicon: detectAppleSilicon(),
      };
    }

    const result = recommendModels(hardware);

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Hardware:');
      console.log(`  RAM: ${result.hardware.ram_gb.toFixed(1)} GB`);
      console.log(`  VRAM: ${result.hardware.vram_gb != null ? result.hardware.vram_gb.toFixed(1) + ' GB' : 'N/A (shared)'} `);
      console.log(`  Disk: ${result.hardware.disk_gb != null ? result.hardware.disk_gb.toFixed(1) + ' GB' : 'N/A'}`);
      console.log(`  Apple Silicon: ${result.hardware.apple_silicon ? 'Yes' : 'No'}`);
      console.log('');
      console.log('Recommended local coding models:');
      if (result.recommended.length === 0) {
        console.log('  None — use cloud models (GLM-5.3 coding plan, GPT-4, etc.)');
      }
      for (const r of result.recommended) {
        console.log(`  ${r.id.padEnd(16)} ${r.name.padEnd(16)} ${r.size_gb}GB — ${r.reason}`);
        if (r.warning) console.log(`    ⚠ ${r.warning}`);
        if (r.disk_warning) console.log(`    ⚠ ${r.disk_warning}`);
      }
      if (result.warnings.length > 0) {
        console.log('');
        console.log('Warnings:');
        for (const w of result.warnings) console.log(`  ⚠ ${w}`);
      }
    }
    return 0;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`Usage:
  node tools/local-coding-model-selector.js models [--json]
    List all supported local coding models and their requirements.

  node tools/local-coding-model-selector.js detect [--json]
    Detect hardware (VRAM, RAM, disk, arch) and probe Ollama.

  node tools/local-coding-model-selector.js recommend [--json]
    Detect hardware and recommend which local coding models can run.

  node tools/local-coding-model-selector.js recommend --vram N --ram N --disk N[--json]
    Recommend using explicit hardware values (for testing/CI).

Environment:
  OLLAMA_HOST  URL for Ollama API (default: http://127.0.0.1:11434)
`);
    return 0;
  }

  console.error(`Unknown command: ${cmd}`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

// Export for programmatic use
exports.detectHardware = function detectHardware() {
  return {
    ram_gb: detectRAM(),
    vram_gb: detectVRAM(),
    disk_gb: detectDisk(),
    apple_silicon: detectAppleSilicon(),
    arch: detectArch(),
  };
};

exports.MODEL_REGISTRY = MODELS;
