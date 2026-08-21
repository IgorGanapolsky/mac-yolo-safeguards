#!/usr/bin/env node
/**
 * meta-glasses-hermes-bridge.js
 * -------------------------------------------------------------
 * Meta Ray-Ban Smart Glasses Hardware, Screen Capture, Voice & 
 * Deep Hermes Inference Action Bridge.
 *
 * Capabilities:
 *  1. Bluetooth Link Status: Probes and connects to "RB Meta 00F1" (80:AA:1C:19:61:C1).
 *  2. Multimodal Screen Capture: Grabs retina screen context for vision models.
 *  3. Deep Inference: Queries Hermes LiteLLM gateway with screen image and prompt.
 *  4. Voice TTS Playback: Streams synthesized speech directly into Meta glasses open-ear speakers.
 *  5. Mac Command/Macro Dispatch: Executes shell and AppleScript automation.
 *
 * Usage:
 *  node tools/meta-glasses-hermes-bridge.js --status
 *  node tools/meta-glasses-hermes-bridge.js --ask "What is on my screen right now?"
 *  node tools/meta-glasses-hermes-bridge.js --command "open Slack and focus Warp"
 *  node tools/meta-glasses-hermes-bridge.js --speak "Connected to Hermes inference engine."
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const META_BT_MAC = '80-aa-1c-19-61-c1';
const META_DEVICE_NAME = 'RB Meta 00F1';
const LITELLM_ENDPOINT = 'http://127.0.0.1:4010/v1/chat/completions';
const SCREENSHOT_PATH = '/tmp/hermes-meta-screen.jpg';

function checkConnection() {
  try {
    // Use execFileSync with explicit args to avoid shell injection
    const out = execFileSync('blueutil', ['--info', META_BT_MAC], { encoding: 'utf8' });
    const isConnected = out.includes('connected');
    return {
      connected: isConnected,
      raw: out.trim(),
      deviceName: META_DEVICE_NAME,
      mac: META_BT_MAC,
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

function ensureConnected() {
  const status = checkConnection();
  if (!status.connected) {
    console.log(`[MetaGlasses] Connecting to ${META_DEVICE_NAME} (${META_BT_MAC})...`);
    try {
      execFileSync('blueutil', ['--connect', META_BT_MAC], { stdio: 'inherit' });
    } catch (_) {}
  }
  return checkConnection();
}

function captureScreen() {
  try {
    // Capture silent full screen without sound, using args array
    execFileSync('screencapture', ['-x', '-t', 'jpg', SCREENSHOT_PATH], { stdio: 'pipe' });
    if (fs.existsSync(SCREENSHOT_PATH)) {
      const stats = fs.statSync(SCREENSHOT_PATH);
      const b64 = fs.readFileSync(SCREENSHOT_PATH).toString('base64');
      return { ok: true, path: SCREENSHOT_PATH, bytes: stats.size, base64: b64 };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: 'File not created' };
}

function speakToGlasses(text, voice = 'Samantha') {
  if (!text) return;
  console.log(`[MetaGlasses Speak] "${text}"`);
  // Use execFileSync (synchronous) so errors are caught inline, not async.
  // Falls back gracefully when `say` is not available (e.g. Linux CI).
  try {
    execFileSync('say', ['-v', voice, text], { stdio: 'ignore' });
  } catch (err) {
    console.error('[MetaGlasses Speak Error]', err.message);
  }
}

async function queryHermesVision(prompt, includeScreen = true) {
  const messages = [];

  if (includeScreen) {
    const screen = captureScreen();
    if (screen.ok) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Analyze this screen and provide concise key takeaways or action items.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${screen.base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  messages.unshift({
    role: 'system',
    content: 'You are Hermes AI connected to Igor\'s Meta smart glasses and OpenClaw. Your answers are spoken directly into his open-ear speakers. Keep answers ultra-concise (1-2 sentences), direct, insightful, and actionable. No filler or markdown formatting.',
  });

  const endpoints = [
    {
      url: LITELLM_ENDPOINT,
      model: includeScreen ? 'vision-gemini' : 'glm-5.3',
      timeout: 10000,
    },
    {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen2.5:3b-64k',
      timeout: 10000,
    },
  ];

  for (const ep of endpoints) {
    try {
      const payload = JSON.stringify({
        model: ep.model,
        messages: includeScreen && ep.url.includes('11434') ? [{ role: 'user', content: prompt }] : messages,
        max_tokens: 250,
        temperature: 0.2,
      });

      const res = await new Promise((resolve, reject) => {
        const u = new URL(ep.url);
        const req = http.request(
          {
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            timeout: ep.timeout,
          },
          (r) => {
            let body = '';
            r.on('data', (chunk) => (body += chunk));
            r.on('end', () => {
              try {
                const data = JSON.parse(body);
                const answer = data.choices?.[0]?.message?.content;
                if (answer) resolve({ ok: true, answer: answer.trim() });
                else resolve({ ok: false, error: data.error?.message || body });
              } catch (e) {
                resolve({ ok: false, error: e.message, raw: body });
              }
            });
          }
        );

        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, error: 'Timeout' });
        });

        req.write(payload);
        req.end();
      });

      if (res.ok) return res;
    } catch (_) {}
  }

  return { ok: false, error: 'All inference endpoints exhausted' };
}

function runMacro(command) {
  console.log(`[MetaGlasses Macro] Executing: ${command}`);
  try {
    const { spawnFileChecked } = require('./lib/safe-exec');
    const result = spawnFileChecked('sh', ['-c', command], {
      allowedBasenames: ['sh'],
      timeout: 30000,
    });
    if (result.status === 0) {
      return { ok: true, output: result.stdout.trim(), stderr: result.stderr?.trim() || '' };
    }
    return { ok: false, error: result.stderr?.trim() || `Exit code ${result.status}`, stderr: result.stderr?.trim() || '' };
  } catch (err) {
    return { ok: false, error: err.message, stderr: err.stderr ? String(err.stderr) : '' };
  }
}

/**
 * OpenClaw Action & Multi-Agent Dispatcher
 * Bridges voice intents from Meta Glasses into OpenClaw agent execution.
 */
async function dispatchOpenClawAction(intent, context = {}) {
  console.log(`[OpenClaw Dispatch] Intent from Meta Glasses: "${intent}"`);
  speakToGlasses(`OpenClaw processing: ${intent.slice(0, 40)}`);

  // Direct fast-path for explicit CLI commands (0ms LLM latency)
  const trimmed = intent.trim();
  if (/^(git|gh|npm|node|open|cmm|osascript|echo|ls|cat|df|ps|kill)\b/i.test(trimmed)) {
    const res = runMacro(trimmed);
    if (res.ok) {
      const msg = `OpenClaw executed: ${trimmed.slice(0, 30)}. Output: ${res.output.slice(0, 60)}`;
      speakToGlasses(`OpenClaw command succeeded.`);
      return { ok: true, command: trimmed, output: res.output, spoken: msg };
    } else {
      speakToGlasses('OpenClaw command failed.');
      return { ok: false, command: trimmed, error: res.error, stderr: res.stderr };
    }
  }

  // Ask Hermes for intent translation & reasoning
  const prompt = `Convert this voice command from Meta Smart Glasses into a precise executable shell command or concise answer for OpenClaw: "${intent}". If it is a Mac command, output only the bash command. If it is an AI inquiry, provide a 1-sentence answer.`;
  const plan = await queryHermesVision(prompt, false);

  if (!plan.ok) {
    const errMsg = 'OpenClaw could not resolve command with Hermes.';
    speakToGlasses(errMsg);
    return { ok: false, error: errMsg };
  }

  const rawAnswer = plan.answer.trim();
  console.log(`[OpenClaw Resolved] ${rawAnswer}`);

  if (/^(git|gh|npm|node|open|cmm|osascript|echo|ls|cat|df|ps|kill)\b/i.test(rawAnswer)) {
    const res = runMacro(rawAnswer);
    if (res.ok) {
      const successMsg = `OpenClaw executed: ${rawAnswer.slice(0, 30)}. Output clean.`;
      speakToGlasses(successMsg);
      return { ok: true, command: rawAnswer, output: res.output, spoken: successMsg };
    } else {
      speakToGlasses('OpenClaw command failed.');
      return { ok: false, command: rawAnswer, error: res.error, stderr: res.stderr };
    }
  }

  speakToGlasses(rawAnswer);
  return { ok: true, answer: rawAnswer };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    const status = checkConnection();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (args.includes('--connect')) {
    const status = ensureConnected();
    console.log(JSON.stringify(status, null, 2));
    speakToGlasses('Meta glasses connected to Hermes and OpenClaw.');
    return;
  }

  if (args.includes('--speak')) {
    const textIndex = args.indexOf('--speak') + 1;
    const text = args[textIndex] || 'Hello Igor, Hermes and OpenClaw are online.';
    speakToGlasses(text);
    return;
  }

  if (args.includes('--screen')) {
    const res = captureScreen();
    console.log(JSON.stringify({ ok: res.ok, path: res.path, bytes: res.bytes }, null, 2));
    return;
  }

  if (args.includes('--ask')) {
    const askIndex = args.indexOf('--ask') + 1;
    const query = args[askIndex] || 'Summarize what is currently on my screen.';
    console.log(`[MetaGlasses Inference] Querying Hermes with screen: "${query}"...`);
    const res = await queryHermesVision(query, true);
    if (res.ok) {
      console.log(`\n🧠 Answer: ${res.answer}\n`);
      speakToGlasses(res.answer);
    } else {
      console.error(`[Inference Failed]`, res.error || res.raw);
      speakToGlasses('Inference request failed.');
    }
    return;
  }

  if (args.includes('--command')) {
    const cmdIndex = args.indexOf('--command') + 1;
    const cmd = args[cmdIndex];
    if (cmd) {
      const res = runMacro(cmd);
      console.log(JSON.stringify(res, null, 2));
      speakToGlasses(res.ok ? 'Command executed successfully.' : 'Command failed.');
    }
    return;
  }

  if (args.includes('--openclaw')) {
    const clawIndex = args.indexOf('--openclaw') + 1;
    const intent = args[clawIndex] || 'Check system status and RAM';
    const result = await dispatchOpenClawAction(intent);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`
Meta Glasses Hermes & OpenClaw Action Bridge
Usage:
  node tools/meta-glasses-hermes-bridge.js --status
  node tools/meta-glasses-hermes-bridge.js --connect
  node tools/meta-glasses-hermes-bridge.js --speak "Text to speak"
  node tools/meta-glasses-hermes-bridge.js --screen
  node tools/meta-glasses-hermes-bridge.js --ask "Your prompt"
  node tools/meta-glasses-hermes-bridge.js --command "sh command"
  node tools/meta-glasses-hermes-bridge.js --openclaw "voice intent"
  `);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkConnection,
  ensureConnected,
  captureScreen,
  speakToGlasses,
  queryHermesVision,
  runMacro,
  dispatchOpenClawAction,
};
