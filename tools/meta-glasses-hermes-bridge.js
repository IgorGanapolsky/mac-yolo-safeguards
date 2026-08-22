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
 *  6. OpenClaw Browser Dispatch: Routes browser automation intents from glasses
 *     to the Hermes Control Plane, enabling hands-free web navigation, clicks,
 *     form fills, and system control via voice.
 *
 * Usage:
 *  node tools/meta-glasses-hermes-bridge.js --status
 *  node tools/meta-glasses-hermes-bridge.js --openclaw-status
 *  node tools/meta-glasses-hermes-bridge.js --ask "What is on my screen right now?"
 *  node tools/meta-glasses-hermes-bridge.js --command "open Slack and focus Warp"
 *  node tools/meta-glasses-hermes-bridge.js --speak "Connected to Hermes inference engine."
 *  node tools/meta-glasses-hermes-bridge.js --openclaw "Open gmail in chrome"
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const META_BT_MAC = '80-aa-1c-19-61-c1';
const META_DEVICE_NAME = 'RB Meta 00F1';
const LITELLM_ENDPOINT = 'http://127.0.0.1:4010/v1/chat/completions';
const SCREENSHOT_PATH = '/tmp/hermes-meta-screen.jpg';
/** HARD: Ray-Ban Meta BT belongs to the phone only. Never Mac-pair / Mac-steal. */
const PHONE_ONLY_BT = process.env.HERMES_GLASSES_PHONE_ONLY !== '0';
const GMAIL_HELPER = path.join(__dirname, 'glasses-gmail.py');
const EMAIL_INTENT_RE = /\b(email|inbox|gmail|unread mail|messages in my mail|what.?s in my (mail|inbox))\b/i;

function checkPhoneGlassesBond() {
  try {
    const out = execFileSync(
      'adb',
      ['shell', 'dumpsys', 'bluetooth_manager'],
      { encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 },
    );
    const hasDevice = /RB Meta/i.test(out) || out.toLowerCase().includes(META_BT_MAC.replace(/-/g, ':'));
    const active = /RB Meta[^\n]*ACTIVE/i.test(out) || /Connected:\s*1[\s\S]{0,120}RB Meta/i.test(out);
    return {
      ok: hasDevice,
      connected: Boolean(active || (hasDevice && /ConnectionState:\s*STATE_CONNECTED/i.test(out))),
      rail: 'phone_bt',
      hermesInstalled: (() => {
        try {
          execFileSync('adb', ['shell', 'pm', 'path', 'com.iganapolsky.hermesmobile'], {
            encoding: 'utf8',
            timeout: 5000,
          });
          return true;
        } catch {
          return false;
        }
      })(),
    };
  } catch (err) {
    return { ok: false, connected: false, rail: 'phone_bt', error: err.message, hermesInstalled: false };
  }
}

function checkMacGlassesBond() {
  try {
    const out = execFileSync('blueutil', ['--info', META_BT_MAC], { encoding: 'utf8' });
    const isConnected = /\bconnected\b/i.test(out) && !out.includes('not connected');
    return {
      connected: isConnected,
      raw: out.trim(),
      rail: 'mac_bt',
      deviceName: META_DEVICE_NAME,
      mac: META_BT_MAC,
    };
  } catch (err) {
    return { connected: false, rail: 'mac_bt', error: err.message, deviceName: META_DEVICE_NAME, mac: META_BT_MAC };
  }
}

/**
 * Truthful multi-rail status.
 * Ray-Ban Meta is usually bonded to the phone (Meta AI), not the Mac.
 * "Hey Meta" will still say it is not Hermes — Meta AI is a closed assistant.
 */
function checkConnection() {
  const mac = checkMacGlassesBond();
  const phone = checkPhoneGlassesBond();
  const connected = Boolean(mac.connected || phone.connected);
  return {
    connected,
    rail: mac.connected ? 'mac_bt' : phone.connected ? 'phone_bt' : 'none',
    mac,
    phone,
    hermesAppInstalled: Boolean(phone.hermesInstalled),
    metaAiOwnsWakeWord: true,
    note: phone.connected && !phone.hermesInstalled
      ? 'Glasses are on the phone via Meta AI; Hermes Mobile is not installed, so Meta AI correctly says it is not connected to Hermes/OpenClaw.'
      : phone.connected && phone.hermesInstalled
        ? 'Glasses on phone + Hermes installed. Wake word is still Meta AI unless a DAT companion session is started from Hermes.'
        : mac.connected
          ? 'Glasses bonded to Mac audio path.'
          : 'No Mac or phone BT bond detected for RB Meta.',
    deviceName: META_DEVICE_NAME,
    macAddress: META_BT_MAC,
  };
}

/**
 * If Mac somehow holds RB Meta, drop it immediately (phone-only policy).
 * Never pairs, never --connect. Disconnect + unpair only.
 */
function releaseMacGlassesBond() {
  const actions = [];
  try {
    const info = execFileSync('blueutil', ['--info', META_BT_MAC], { encoding: 'utf8' });
    const connected = /\bconnected\b/i.test(info) && !/not connected/i.test(info);
    const paired = /\bpaired\b/i.test(info) && !/not paired/i.test(info);
    if (connected) {
      try {
        execFileSync('blueutil', ['--disconnect', META_BT_MAC], { stdio: 'pipe' });
        actions.push('disconnect');
      } catch (_) {
        actions.push('disconnect_failed');
      }
    }
    if (paired || connected) {
      try {
        execFileSync('blueutil', ['--unpair', META_BT_MAC], { stdio: 'pipe' });
        actions.push('unpair');
      } catch (_) {
        actions.push('unpair_failed');
      }
    }
    if (actions.length === 0) actions.push('mac_clear');
  } catch (err) {
    actions.push(`probe_error:${err.message}`);
  }
  return { ok: true, mac: META_BT_MAC, actions };
}

/**
 * Phone-only ensure: never Mac BT connect.
 * --connect used to blueutil --connect and steal the glasses from the phone.
 */
function ensureConnected() {
  if (PHONE_ONLY_BT) {
    const release = releaseMacGlassesBond();
    const status = checkConnection();
    status.phoneOnly = true;
    status.macRelease = release;
    if (status.phone?.connected) {
      console.log(
        `[MetaGlasses] Phone owns ${META_DEVICE_NAME} (phone_bt). Mac BT steal disabled.`,
      );
    } else if (status.mac?.connected) {
      // Should be rare: releaseMacGlassesBond already ran; re-probe.
      console.log(
        `[MetaGlasses] Mac was holding ${META_DEVICE_NAME}; released. Reconnect glasses in Meta AI on the phone.`,
      );
    } else {
      console.log(
        `[MetaGlasses] ${META_DEVICE_NAME} not on phone BT yet. Open Meta AI on the phone — do not pair to this Mac.`,
      );
    }
    return status;
  }

  // Escape hatch only: HERMES_GLASSES_PHONE_ONLY=0 (not the default).
  const status = checkConnection();
  if (status.connected) return status;
  if (!status.phone?.connected) {
    console.log(`[MetaGlasses] Connecting to ${META_DEVICE_NAME} (${META_BT_MAC}) on Mac...`);
    try {
      execFileSync('blueutil', ['--connect', META_BT_MAC], { stdio: 'inherit' });
    } catch (_) {}
  }
  return checkConnection();
}

const PHONE_SCREENSHOT_PATH = '/tmp/hermes-phone-screen.png';

function capturePhoneScreen() {
  try {
    execFileSync('sh', ['-c', `adb exec-out screencap -p > ${PHONE_SCREENSHOT_PATH}`], { stdio: 'pipe' });
    if (fs.existsSync(PHONE_SCREENSHOT_PATH)) {
      const stats = fs.statSync(PHONE_SCREENSHOT_PATH);
      const b64 = fs.readFileSync(PHONE_SCREENSHOT_PATH).toString('base64');
      return { ok: true, path: PHONE_SCREENSHOT_PATH, bytes: stats.size, base64: b64 };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: 'Phone screenshot not created' };
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

const RECORDING_PATH = '/tmp/hermes-meta-recording.mp4';

function recordScreen(durationSec = 5, outputPath = RECORDING_PATH) {
  console.log(`[MetaGlasses Record] Recording screen sequence for ${durationSec}s...`);
  speakToGlasses(`Recording screen for ${durationSec} seconds.`);
  
  const frameDir = '/tmp/hermes-meta-frames';
  try {
    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });
    // Clean old frames
    fs.readdirSync(frameDir).forEach((f) => fs.unlinkSync(path.join(frameDir, f)));

    const fps = 2; // 2 frames per sec for high quality visual grounding
    const totalFrames = durationSec * fps;
    const intervalMs = Math.round(1000 / fps);

    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(frameDir, `frame_${String(i).padStart(4, '0')}.jpg`);
      execFileSync('screencapture', ['-x', '-t', 'jpg', framePath], { stdio: 'pipe' });
      // Small sync sleep between frames
      execFileSync('sleep', [String(intervalMs / 1000)]);
    }

    // Compile into mp4 with ffmpeg
    execFileSync('ffmpeg', [
      '-y',
      '-r', String(fps),
      '-i', path.join(frameDir, 'frame_%04d.jpg'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      outputPath
    ], { stdio: 'pipe' });

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const msg = `Screen recording complete. Captured ${totalFrames} frames.`;
      speakToGlasses(msg);
      return { ok: true, path: outputPath, bytes: stats.size, frames: totalFrames, durationSec };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: 'Recording failed' };
}

function getVoiceForText(text, explicitVoice = null) {
  if (explicitVoice) return explicitVoice;
  if (!text) return 'Samantha';
  // Russian / Cyrillic characters
  if (/[\u0400-\u04FF]/.test(text)) return 'Milena';
  // Spanish accents / markers
  if (/[áéíóúüñ¿¡]/i.test(text)) return 'Paulina';
  return 'Samantha';
}

function speakToGlasses(text, voice = null) {
  if (!text) return;
  const chosenVoice = getVoiceForText(text, voice);
  console.log(`[MetaGlasses Speak (${chosenVoice})] "${text}"`);
  // Use execFileSync (synchronous) so errors are caught inline, not async.
  // Falls back gracefully when `say` is not available (e.g. Linux CI).
  try {
    execFileSync('say', ['-v', chosenVoice, text], { stdio: 'ignore' });
  } catch (err) {
    console.error('[MetaGlasses Speak Error]', err.message);
  }
}

async function translateText(text, targetLang = 'es') {
  const isRussian = /^ru/i.test(targetLang) || /russian/i.test(targetLang);
  const langName = isRussian ? 'Russian' : 'Spanish';
  const targetVoice = isRussian ? 'Milena' : 'Paulina';

  const prompt = `Translate the following text into natural, fluent ${langName}. Output ONLY the translated text, no explanations, no quotes, no markdown formatting:\n\n"${text}"`;

  const endpoints = [
    { url: LITELLM_ENDPOINT, model: 'glm-5.3' },
    { url: LITELLM_ENDPOINT, model: 'vision-gemini' },
    { url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen3.5:9b-hermes-64k' },
  ];

  for (const ep of endpoints) {
    try {
      const payload = JSON.stringify({
        model: ep.model,
        messages: [
          { role: 'system', content: `You are a real-time speech interpreter for Meta smart glasses. Translate directly into natural ${langName}. Output only the translation.` },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.1,
      });

      const res = await new Promise((resolve) => {
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
            timeout: 10000,
          },
          (r) => {
            let b = '';
            r.on('data', (c) => (b += c));
            r.on('end', () => {
              try {
                const data = JSON.parse(b);
                const answer = data.choices?.[0]?.message?.content?.trim();
                if (answer) resolve({ ok: true, translation: answer, targetLang, voice: targetVoice, model: ep.model });
                else resolve({ ok: false, error: data.error?.message || b });
              } catch (e) {
                resolve({ ok: false, error: e.message });
              }
            });
          }
        );
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
        req.write(payload);
        req.end();
      });

      if (res.ok) {
        speakToGlasses(res.translation, targetVoice);
        return res;
      }
    } catch (_) {}
  }
  return { ok: false, error: 'Translation endpoints exhausted' };
}

function readGmailInbox(n = 5, query = 'in:inbox') {
  const pyCandidates = [
    path.join(process.env.HOME || '', '.hermes/venvs/google-workspace/bin/python3'),
    'python3',
  ];
  let lastErr = 'python3 missing';
  for (const py of pyCandidates) {
    try {
      const out = execFileSync(
        py,
        [GMAIL_HELPER, '--n', String(n), '--query', query],
        { encoding: 'utf8', timeout: 20000 },
      );
      const parsed = JSON.parse(out);
      return parsed;
    } catch (err) {
      lastErr = err.message;
    }
  }
  return { ok: false, error: lastErr, email: 'iganapolsky@gmail.com' };
}

function listLiteLlmModels() {
  try {
    const out = execFileSync('curl', ['-sS', '-m', '3', 'http://127.0.0.1:4010/v1/models'], {
      encoding: 'utf8',
    });
    const data = JSON.parse(out);
    return (data.data || []).map((m) => m.id).filter(Boolean).slice(0, 40);
  } catch (err) {
    return { error: err.message };
  }
}

function capabilities() {
  const conn = checkConnection();
  const gmail = readGmailInbox(1);
  let ollama = [];
  try {
    const tags = JSON.parse(
      execFileSync('curl', ['-sS', '-m', '3', 'http://127.0.0.1:11434/api/tags'], { encoding: 'utf8' }),
    );
    ollama = (tags.models || []).map((m) => m.name).slice(0, 20);
  } catch (_) {}
  return {
    phoneOnly: PHONE_ONLY_BT,
    glasses: conn,
    gmail: {
      ok: Boolean(gmail.ok),
      email: gmail.email || 'iganapolsky@gmail.com',
      messagesTotal: gmail.messagesTotal || 0,
      note: gmail.ok
        ? 'Hermes Gmail rail live. Hey Meta uses a separate Meta AI Apps connector.'
        : gmail.error,
    },
    llms: {
      litellm: listLiteLlmModels(),
      ollama,
    },
    mcp: {
      broker: 'http://127.0.0.1:8766/mcp',
      tools: [
        'send_message',
        'poll_messages',
        'glasses_capture',
        'it_diagnose_hardware',
        'it_analyze_incident',
        'it_system_voice_hud',
      ],
    },
    honesty: {
      heyMeta: 'Meta closed assistant — cannot run Hermes/MCP/Gmail unless Meta Apps Gmail is connected in the Meta AI app.',
      hermesRail: 'node tools/meta-glasses-hermes-bridge.js --email|--ask|--openclaw uses Hermes Gmail + LiteLLM + OpenClaw MCP.',
    },
  };
}

function getActiveDesktopContext() {
  let appName = '';
  let gitBranch = '';
  try {
    appName = execFileSync('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], { encoding: 'utf8' }).trim();
  } catch (_) {}
  try {
    gitBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_) {}
  return { appName, gitBranch };
}

async function queryHermesVision(prompt, options = true) {
  // Support boolean includeScreen or options object { screen: true, phone: false }
  const isScreen = typeof options === 'boolean' ? options : (options?.screen ?? false);
  const isPhone = typeof options === 'object' ? (options?.phone ?? false) : false;

  const messages = [];
  const desk = getActiveDesktopContext();
  const contextNote = desk.appName ? ` [Desktop Context: Active Frontmost App is ${desk.appName}${desk.gitBranch ? `, Git Branch: ${desk.gitBranch}` : ''}]` : '';

  let hasImage = false;

  if (isPhone) {
    const phone = capturePhoneScreen();
    if (phone.ok) {
      hasImage = true;
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: (prompt || 'Analyze this phone screen and provide concise key takeaways or action items.') },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${phone.base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: (prompt || 'Analyze phone state') + ` (Phone capture failed: ${phone.error})` });
    }
  } else if (isScreen) {
    const screen = captureScreen();
    if (screen.ok) {
      hasImage = true;
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: (prompt || 'Analyze this screen and provide concise key takeaways or action items.') + contextNote },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${screen.base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt + contextNote });
    }
  } else {
    messages.push({ role: 'user', content: prompt + contextNote });
  }

  messages.unshift({
    role: 'system',
    content: 'You are Hermes AI connected to Igor\'s Meta smart glasses and OpenClaw. Your answers are spoken directly into his open-ear speakers. Keep answers ultra-concise (1-2 sentences), direct, insightful, and actionable. No filler or markdown formatting.',
  });

  const endpoints = [
    {
      url: LITELLM_ENDPOINT,
      model: hasImage ? 'vision-gemini' : 'glm-5.3',
      timeout: 10000,
    },
    {
      url: LITELLM_ENDPOINT,
      model: hasImage ? 'glm-vision' : 'glm-coding',
      timeout: 12000,
    },
    {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: hasImage ? 'qwen3-vl:4b-instruct' : 'qwen3.5:9b-hermes-64k',
      timeout: 12000,
    },
  ];

  for (const ep of endpoints) {
    try {
      const payload = JSON.stringify({
        model: ep.model,
        messages: hasImage && ep.url.includes('11434') ? [{ role: 'user', content: prompt + contextNote }] : messages,
        max_tokens: 250,
        temperature: 0.1,
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
                if (answer) resolve({ ok: true, answer: answer.trim(), model: ep.model });
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

const OPENCLAW_CONTROL_PLANE = 'http://127.0.0.1:3000';
const MCP_BROKER = 'http://127.0.0.1:8766/mcp';
const BROWSER_INTENT_RE = /\b(open\s+(url|website|webpage|browser)|navigate|go to|visit|click|browse|search|login|fill|submit|scroll|refresh|bookmark)\b/i;

/**
 * OpenClaw / Hermes reachability — MCP broker is the live rail; :3000 control plane is optional.
 */
function checkOpenClawStatus() {
  const probe = (url) =>
    new Promise((resolve) => {
      try {
        const u = new URL(url);
        const req = http.request(
          { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', timeout: 3000 },
          (r) => {
            let body = '';
            r.on('data', (c) => (body += c));
            r.on('end', () => resolve({ ok: true, status: r.statusCode, reachable: true, body: body.slice(0, 200) }));
          },
        );
        req.on('error', (e) => resolve({ ok: false, reachable: false, error: e.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, reachable: false, error: 'Connection timeout' });
        });
        req.end();
      } catch (err) {
        resolve({ ok: false, reachable: false, error: err.message });
      }
    });

  return Promise.all([
    probe('http://127.0.0.1:8766/health'),
    probe(OPENCLAW_CONTROL_PLANE + '/'),
  ]).then(([mcp, controlPlane]) => {
    const ok = Boolean(mcp.ok);
    return {
      ok,
      reachable: ok,
      mcpBroker: mcp,
      controlPlane,
      note: ok
        ? controlPlane.ok
          ? 'OpenClaw MCP broker + control plane reachable'
          : 'OpenClaw MCP broker healthy; glasses control plane :3000 down (optional)'
        : 'OpenClaw MCP broker not reachable on :8766',
    };
  });
}

/**
 * Dispatch a browser automation intent to the OpenClaw control plane
 * via the glasses macro endpoint, and also relay through the MCP broker
 * for cross-agent visibility. Returns the control plane's response.
 */
async function dispatchBrowserAction(intent, context = {}) {
  const screen = captureScreen();
  const payload = JSON.stringify({
    action: 'macro',
    command: intent,
    context: Object.assign({
      screen: screen.ok ? { ok: true, bytes: screen.bytes } : { ok: false },
      desktop: getActiveDesktopContext(),
    }, context),
  });

  const result = await new Promise((resolve) => {
    const u = new URL(OPENCLAW_CONTROL_PLANE + '/api/glasses');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 15000,
      },
      (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => {
          try {
            resolve({ ok: true, status: r.statusCode, response: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: true, status: r.statusCode, response: body });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.write(payload);
    req.end();
  });

  // Relay intent through MCP broker for cross-agent visibility
  const mcpPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: 'send_message',
      arguments: {
        sender: 'meta-glasses',
        recipient: 'hermes',
        channel: 'browser-automation',
        content: `BROWSER INTENT: ${intent}`,
      },
    },
  });

  const mcpU = new URL(MCP_BROKER);
  const mcpReq = http.request(
    {
      hostname: mcpU.hostname,
      port: mcpU.port,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(mcpPayload),
        'Accept': 'text/event-stream, application/json',
      },
      timeout: 5000,
    },
    (r) => {
      r.on('data', () => {});
      r.on('end', () => {});
    }
  );
  mcpReq.on('error', () => {});
  mcpReq.on('timeout', () => { mcpReq.destroy(); });
  mcpReq.write(mcpPayload);
  mcpReq.end();

  return result;
}

/**
 * OpenClaw Action & Multi-Agent Dispatcher
 * Bridges voice intents from Meta Glasses into OpenClaw agent execution.
 * Recognizes browser automation intents and routes them to the control
 * plane; falls back to Hermes LLM for command translation.
 */
async function dispatchOpenClawAction(intent, context = {}) {
  console.log(`[OpenClaw Dispatch] Intent from Meta Glasses: "${intent}"`);
  speakToGlasses(`OpenClaw processing: ${intent.slice(0, 40)}`);

  const trimmed = intent.trim();

  if (EMAIL_INTENT_RE.test(trimmed)) {
    const inbox = readGmailInbox(5);
    if (!inbox.ok) {
      speakToGlasses('Hermes Gmail is not readable right now.');
      return { ok: false, type: 'email', error: inbox.error };
    }
    const lines = (inbox.messages || [])
      .map((m) => `${m.from}: ${m.subject}`)
      .join(' | ');
    const prompt = `Igor asked via Meta glasses: "${trimmed}". His Gmail ${inbox.email} has ${inbox.messagesTotal} messages. Latest: ${lines}. Answer in 1-2 spoken sentences. Do not claim email is disconnected.`;
    const plan = await queryHermesVision(prompt, false);
    const spoken = plan.ok ? plan.answer : `Inbox for ${inbox.email} is connected. Latest: ${(inbox.messages[0] || {}).subject || 'no subject'}.`;
    speakToGlasses(spoken);
    return { ok: true, type: 'email', email: inbox.email, messages: inbox.messages, spoken };
  }

  // Direct fast-path for explicit CLI commands (0ms LLM latency)
  if (/^(git|gh|npm|node|open|cmm|osascript|echo|ls|cat|df|ps|kill)\b/i.test(trimmed)) {
    const res = runMacro(trimmed);
    if (res.ok) {
      const msg = `OpenClaw executed: ${trimmed.slice(0, 30)}. Output: ${res.output.slice(0, 60)}`;
      speakToGlasses(`Command succeeded.`);
      return { ok: true, command: trimmed, output: res.output, spoken: msg };
    } else {
      speakToGlasses('OpenClaw command failed.');
      return { ok: false, command: trimmed, error: res.error, stderr: res.stderr };
    }
  }

  // Browser automation intents → dispatch to control plane
  if (BROWSER_INTENT_RE.test(trimmed)) {
    const res = await dispatchBrowserAction(trimmed, context);
    if (res.ok) {
      speakToGlasses('OpenClaw browser action dispatched.');
      return { ok: true, type: 'browser', command: trimmed, response: res.response, dispatchStatus: res.status };
    } else {
      speakToGlasses('OpenClaw browser dispatch failed. Trying Hermes fallback.');
      // Fall through to Hermes LLM path below
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

  if (args.includes('--capabilities')) {
    console.log(JSON.stringify(capabilities(), null, 2));
    return;
  }

  if (args.includes('--email')) {
    const qIndex = args.indexOf('--email') + 1;
    const maybeQuery = args[qIndex] && !args[qIndex].startsWith('--') ? args[qIndex] : 'in:inbox';
    const inbox = readGmailInbox(5, maybeQuery);
    console.log(JSON.stringify(inbox, null, 2));
    if (inbox.ok) {
      const first = (inbox.messages && inbox.messages[0]) || {};
      speakToGlasses(
        `Gmail ${inbox.email} is connected. ${inbox.messagesTotal} messages. Latest: ${first.subject || 'empty inbox'}.`,
      );
    } else {
      speakToGlasses('Hermes Gmail could not be read.');
    }
    return;
  }

  if (args.includes('--release-mac') || args.includes('--phone-only')) {
    const release = releaseMacGlassesBond();
    const status = checkConnection();
    console.log(JSON.stringify({ phoneOnly: true, release, status }, null, 2));
    return;
  }

  if (args.includes('--connect')) {
    // Phone-only: never Mac-steal. Same as ensureConnected under PHONE_ONLY_BT.
    const status = ensureConnected();
    console.log(JSON.stringify({ ...status, phoneOnly: PHONE_ONLY_BT }, null, 2));
    if (status.phone?.connected) {
      speakToGlasses('Glasses stay on the phone. Mac Bluetooth steal is off.');
    } else {
      speakToGlasses('Connect the glasses in Meta AI on your phone. Not this Mac.');
    }
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

  if (args.includes('--record')) {
    const recIndex = args.indexOf('--record') + 1;
    const sec = parseInt(args[recIndex], 10) || 5;
    const res = recordScreen(sec);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.includes('--ask')) {
    const askIndex = args.indexOf('--ask') + 1;
    const prompt = args[askIndex] || 'What should I know right now?';
    if (EMAIL_INTENT_RE.test(prompt)) {
      const res = await dispatchOpenClawAction(prompt);
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    const query = prompt || 'Summarize what is currently on my screen.';
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

  if (args.includes('--openclaw-status')) {
    const status = await checkOpenClawStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (args.includes('--phone-screen')) {
    const res = capturePhoneScreen();
    console.log(JSON.stringify({ ok: res.ok, path: res.path, bytes: res.bytes }, null, 2));
    return;
  }

  if (args.includes('--phone-ask')) {
    const askIndex = args.indexOf('--phone-ask') + 1;
    const query = args[askIndex] || 'Summarize what is currently on my phone screen.';
    console.log(`[MetaGlasses Inference] Querying Hermes with phone screen: "${query}"...`);
    const res = await queryHermesVision(query, { screen: false, phone: true });
    if (res.ok) {
      console.log(`\n🧠 Answer (${res.model || 'hermes'}): ${res.answer}\n`);
      speakToGlasses(res.answer);
    } else {
      console.error(`[Inference Failed]`, res.error || res.raw);
      speakToGlasses('Phone inference request failed.');
    }
    return;
  }

  if (args.includes('--phone-command')) {
    const cmdIndex = args.indexOf('--phone-command') + 1;
    const cmd = args[cmdIndex];
    if (cmd) {
      const res = runPhoneMacro(cmd);
      console.log(JSON.stringify(res, null, 2));
      speakToGlasses(res.ok ? 'Phone command executed.' : 'Phone command failed.');
    }
    return;
  }

  if (args.includes('--translate')) {
    const tIndex = args.indexOf('--translate') + 1;
    const targetLang = args[tIndex] || 'es';
    const text = args[tIndex + 1] || 'Hello, real-time translation is active on your Meta smart glasses.';
    console.log(`[MetaGlasses Translation] Translating to ${targetLang}: "${text}"...`);
    const res = await translateText(text, targetLang);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.includes('--translate-es')) {
    const tIndex = args.indexOf('--translate-es') + 1;
    const text = args[tIndex] || 'Hello, real-time Spanish translation is online.';
    console.log(`[MetaGlasses Translation (ES)] "${text}"...`);
    const res = await translateText(text, 'es');
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.includes('--translate-ru')) {
    const tIndex = args.indexOf('--translate-ru') + 1;
    const text = args[tIndex] || 'Hello, real-time Russian translation is online.';
    console.log(`[MetaGlasses Translation (RU)] "${text}"...`);
    const res = await translateText(text, 'ru');
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log(`
Meta Glasses Hermes & OpenClaw Action Bridge
Usage:
  node tools/meta-glasses-hermes-bridge.js --status
  node tools/meta-glasses-hermes-bridge.js --capabilities
  node tools/meta-glasses-hermes-bridge.js --email
  node tools/meta-glasses-hermes-bridge.js --connect          # phone-only; never Mac BT steal
  node tools/meta-glasses-hermes-bridge.js --phone-only       # disconnect+unpair Mac if holding glasses
  node tools/meta-glasses-hermes-bridge.js --release-mac      # alias of --phone-only
  node tools/meta-glasses-hermes-bridge.js --speak "Text to speak"
  node tools/meta-glasses-hermes-bridge.js --translate es "Text to translate to Spanish"
  node tools/meta-glasses-hermes-bridge.js --translate ru "Text to translate to Russian"
  node tools/meta-glasses-hermes-bridge.js --translate-es "Text to translate"
  node tools/meta-glasses-hermes-bridge.js --translate-ru "Text to translate"
  node tools/meta-glasses-hermes-bridge.js --screen
  node tools/meta-glasses-hermes-bridge.js --phone-screen
  node tools/meta-glasses-hermes-bridge.js --record [seconds]
  node tools/meta-glasses-hermes-bridge.js --ask "Your prompt"
  node tools/meta-glasses-hermes-bridge.js --phone-ask "Your prompt"
  node tools/meta-glasses-hermes-bridge.js --command "sh command"
  node tools/meta-glasses-hermes-bridge.js --phone-command "adb command"
  node tools/meta-glasses-hermes-bridge.js --openclaw "voice intent"
  node tools/meta-glasses-hermes-bridge.js --openclaw-status
  `);
}

function runPhoneMacro(command) {
  console.log(`[MetaGlasses Phone Macro] Executing: ${command}`);
  try {
    const out = execFileSync('adb', ['shell', command], { encoding: 'utf8', timeout: 15000 });
    return { ok: true, output: out.trim() };
  } catch (err) {
    return { ok: false, error: err.message, stderr: err.stderr ? String(err.stderr) : '' };
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkConnection,
  ensureConnected,
  releaseMacGlassesBond,
  readGmailInbox,
  capabilities,
  PHONE_ONLY_BT,
  META_BT_MAC,
  META_DEVICE_NAME,
  captureScreen,
  capturePhoneScreen,
  recordScreen,
  speakToGlasses,
  translateText,
  getVoiceForText,
  queryHermesVision,
  runMacro,
  runPhoneMacro,
  dispatchOpenClawAction,
  checkOpenClawStatus,
  dispatchBrowserAction,
};
