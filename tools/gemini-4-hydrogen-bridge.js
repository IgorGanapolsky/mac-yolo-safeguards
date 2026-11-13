#!/usr/bin/env node
'use strict';

/**
 * Gemini 4 Hydrogen OMP + Herdr Integration & Live Execution Bridge
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const HYDROGEN_MODELS = Object.freeze({
  low: 'google-antigravity/gemini-4-hydrogen-low',
  medium: 'google-antigravity/gemini-4-hydrogen-medium',
  high: 'google-antigravity/gemini-4-hydrogen-high',
  xhigh: 'google-antigravity/gemini-4-hydrogen-xhigh',
  directApi: 'gemini-4-hydrogen',
});

const VALID_V1BETA_THINKING = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);

function hasArrayWithoutItems(src) {
  const lines = String(src || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/"type"\s*:\s*"array"/.test(lines[i])) {
      const windowText = lines.slice(i, i + 5).join(' ');
      if (!/"items"\s*:/.test(windowText)) return true;
    }
  }
  return false;
}

function inspectOmpHerdrHydrogenSetup(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const ompConfigPath = path.join(homeDir, '.omp', 'agent', 'config.yml');
  const herdrExtPath = path.join(homeDir, '.omp', 'agent', 'extensions', 'herdr-fork-in.ts');
  const gurobiMcpPath = path.join(homeDir, '.hermes', 'gurobi', 'gurobi-mcp-server.py');
  const modelBridgePath = path.join(homeDir, '.local', 'bin', 'hermes-model-bridge.py');

  const ompConfig = fs.existsSync(ompConfigPath) ? fs.readFileSync(ompConfigPath, 'utf8') : '';
  const herdrExt = fs.existsSync(herdrExtPath) ? fs.readFileSync(herdrExtPath, 'utf8') : '';
  const gurobiExists = fs.existsSync(gurobiMcpPath);
  const gurobiSrc = gurobiExists ? fs.readFileSync(gurobiMcpPath, 'utf8') : '';
  const bridgeExists = fs.existsSync(modelBridgePath);
  const bridgeSrc = bridgeExists ? fs.readFileSync(modelBridgePath, 'utf8') : '';

  const checks = {
    ompTaskRoleHydrogen: /^\s*task:\s*google-antigravity\/gemini-4-hydrogen-(high|xhigh|medium)\s*$/m.test(ompConfig),
    ompSmolRoleHydrogen: /^\s*smol:\s*google-antigravity\/gemini-4-hydrogen-(low|medium|high)\s*$/m.test(ompConfig),
    ompFallbackHydrogen:
      ompConfig.includes('google-antigravity/gemini-4-hydrogen-xhigh') &&
      ompConfig.includes('google-antigravity/gemini-4-hydrogen-medium:'),
    herdrReviewPaneHydrogen:
      herdrExt.includes('registerCommand("review-pane"') &&
      herdrExt.includes('google-antigravity/gemini-4-hydrogen-high'),
    herdrHydrogenCommand: herdrExt.includes('registerCommand("hydrogen"'),
    gurobiArraySchemasValid: gurobiExists && !hasArrayWithoutItems(gurobiSrc),
    modelBridgeWireIdValid: !bridgeExists || bridgeSrc.includes('"gemini-4-hydrogen-high"'),
  };

  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    models: HYDROGEN_MODELS,
    paths: { ompConfigPath, herdrExtPath, gurobiMcpPath, modelBridgePath },
    checks,
  };
}

function normalizeV1BetaThinkingLevel(level) {
  const upper = String(level || 'HIGH').toUpperCase();
  if (upper === 'XHIGH') return 'HIGH';
  return VALID_V1BETA_THINKING.has(upper) ? upper : 'HIGH';
}

function callGeminiHydrogenApi(prompt, options = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    return Promise.reject(new Error('Non-empty prompt is required'));
  }
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('Missing GEMINI_API_KEY / GOOGLE_API_KEY for direct REST call'));
  }
  const thinkingLevel = normalizeV1BetaThinkingLevel(options.thinkingLevel);
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: cleanPrompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingLevel },
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${HYDROGEN_MODELS.directApi}:generateContent`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: options.timeoutMs || 60000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 400) {
              return reject(new Error(`Gemini API HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            }
            const text = (parsed.candidates?.[0]?.content?.parts || [])
              .filter((p) => !p.thought)
              .map((p) => p.text || '')
              .join('');
            resolve({ model: HYDROGEN_MODELS.directApi, statusCode: res.statusCode, text, usage: parsed.usageMetadata || null });
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Gemini API request timed out')); });
    req.write(payload);
    req.end();
  });
}

function runHydrogenViaOmp(prompt, options = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    return { ok: false, status: 1, model: null, output: '', error: 'Non-empty prompt is required' };
  }
  const tier = options.tier || 'high';
  const model = HYDROGEN_MODELS[tier] || HYDROGEN_MODELS.high;
  const res = spawnSync(
    'omp',
    [
      '-p',
      '--no-session',
      '--no-tools',
      '--no-extensions',
      '--no-skills',
      '--no-rules',
      '--no-context-files',
      '--model',
      model,
      '--',
      cleanPrompt,
    ],
    {
      encoding: 'utf8',
      timeout: options.timeoutMs || 60000,
    },
  );
  return {
    ok: res.status === 0,
    status: res.status,
    model,
    output: (res.stdout || '').trim(),
    error: res.status === 0 ? null : (res.stderr || res.stdout || '').trim().slice(0, 400),
  };
}

function hasDirectGeminiApiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.length === 0) {
    const status = inspectOmpHerdrHydrogenSetup();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.ok ? 0 : 1);
  }
  const tierIdx = args.indexOf('--tier');
  const tier = tierIdx !== -1 && args[tierIdx + 1] ? args[tierIdx + 1] : 'high';
  const prompt = args.filter((a, i) => a !== '--json' && a !== '--tier' && i !== tierIdx + 1).join(' ').trim();
  if (!prompt) {
    console.error('Error: non-empty prompt required (or pass --doctor)');
    process.exit(1);
  }
  if (hasDirectGeminiApiKey()) {
    const apiRes = await callGeminiHydrogenApi(prompt, { thinkingLevel: tier });
    console.log(JSON.stringify(apiRes, null, 2));
    return;
  }
  const ompRes = runHydrogenViaOmp(prompt, { tier });
  console.log(JSON.stringify(ompRes, null, 2));
  process.exit(ompRes.ok ? 0 : 1);
}

module.exports = {
  HYDROGEN_MODELS,
  inspectOmpHerdrHydrogenSetup,
  normalizeV1BetaThinkingLevel,
  callGeminiHydrogenApi,
  runHydrogenViaOmp,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
