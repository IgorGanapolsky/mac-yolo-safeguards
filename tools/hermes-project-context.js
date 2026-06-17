#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const usage = `Usage:
  node tools/hermes-project-context.js [--apply] [--json]

Pins Hermes project context for this repo:
- sets terminal.cwd to the repo root
- installs the repo-owned Hermes skill
- updates Telegram DM channel prompt when a home chat id is available
- records non-secret project context in Hermes built-in memory files`;

function parseArgs(argv) {
  const args = { apply: false, json: false, help: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 20000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function repoRoot() {
  const result = run('git', ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) return process.cwd();
  return result.stdout.trim();
}

function readEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamped = `${file}.bak.${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}.project-context`;
  fs.copyFileSync(file, stamped);
  return stamped;
}

function writeIfChanged(file, next) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (previous === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}

function appendMarker(file, marker) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (previous.includes(marker.trim())) return false;
  const next = `${previous.trim()}${previous.trim() ? '\n§\n' : ''}${marker}`;
  return writeIfChanged(file, next);
}

function applyConfig(projectRoot, chatId) {
  const py = `${os.homedir()}/.hermes/hermes-agent/venv/bin/python`;
  const script = `
import json, os, pathlib, yaml
path = pathlib.Path.home() / ".hermes/config.yaml"
cfg = yaml.safe_load(path.read_text()) or {}
cfg.setdefault("terminal", {})["cwd"] = os.environ["HERMES_PROJECT_ROOT"]
if os.environ.get("HERMES_TELEGRAM_CHAT_ID"):
    prompt = (
        "Active project context for Igor's Telegram DM:\\n"
        f"- Current repo: {os.environ['HERMES_PROJECT_ROOT']}\\n"
        "- Current task lane: Hermes Telegram reliability, hermes-yolo safeguards, Mac YOLO safety, and local inference readiness.\\n"
        "- If asked which project is active, answer with this repo unless Igor explicitly switches projects.\\n"
        "- Do not ask Igor to provide the project path when this prompt already gives it.\\n"
    )
    cfg.setdefault("telegram", {}).setdefault("channel_prompts", {})[os.environ["HERMES_TELEGRAM_CHAT_ID"]] = prompt
path.write_text(yaml.safe_dump(cfg, sort_keys=False))
print(json.dumps({
  "terminal_cwd": cfg.get("terminal", {}).get("cwd"),
  "telegram_prompt_set": bool(os.environ.get("HERMES_TELEGRAM_CHAT_ID")),
}))
`;
  const result = spawnSync(py, ['-c', script], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, HERMES_PROJECT_ROOT: projectRoot, HERMES_TELEGRAM_CHAT_ID: chatId || '' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `config python exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  const root = repoRoot();
  const hermesHome = path.join(os.homedir(), '.hermes');
  const env = readEnvFile(path.join(hermesHome, '.env'));
  const chatId = env.TELEGRAM_HOME_CHANNEL || '';
  const skillSource = path.join(root, 'hermes-skills', 'mac-yolo-safeguards', 'SKILL.md');
  const skillTarget = path.join(hermesHome, 'skills', 'autonomous-ai-agents', 'mac-yolo-safeguards', 'SKILL.md');
  const configPath = path.join(hermesHome, 'config.yaml');
  const memoryPath = path.join(hermesHome, 'memories', 'MEMORY.md');
  const userPath = path.join(hermesHome, 'memories', 'USER.md');

  const result = {
    projectRoot: root,
    chatIdDetected: Boolean(chatId),
    actions: [],
    backups: [],
  };

  if (!args.apply) {
    result.actions.push('dry-run: no files changed');
  } else {
    const configBackup = backup(configPath);
    if (configBackup) result.backups.push(configBackup);
    result.config = applyConfig(root, chatId);
    result.actions.push(`set terminal.cwd=${root}`);
    if (chatId) result.actions.push('set Telegram DM project prompt');

    const skillBackup = backup(skillTarget);
    if (skillBackup) result.backups.push(skillBackup);
    const skillChanged = writeIfChanged(skillTarget, fs.readFileSync(skillSource, 'utf8'));
    result.actions.push(`${skillChanged ? 'installed' : 'verified'} Hermes skill at ${skillTarget}`);

    const memoryBackup = backup(memoryPath);
    if (memoryBackup) result.backups.push(memoryBackup);
    const memoryChanged = appendMarker(
      memoryPath,
      `Current active Telegram project context: ${root} is the active repo for Hermes Telegram reliability, hermes-yolo safeguards, Mac YOLO safety, and local inference readiness. Prefer this project unless Igor explicitly switches projects.\n`
    );
    result.actions.push(`${memoryChanged ? 'updated' : 'verified'} Hermes MEMORY.md project marker`);

    const userBackup = backup(userPath);
    if (userBackup) result.backups.push(userBackup);
    const userChanged = appendMarker(
      userPath,
      `Project preference: when Igor asks through Telegram which project is active for the Hermes reliability lane, use ${root} unless he explicitly names another repo.\n`
    );
    result.actions.push(`${userChanged ? 'updated' : 'verified'} Hermes USER.md project marker`);
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Project root: ${result.projectRoot}`);
    console.log(`Telegram chat id detected: ${result.chatIdDetected ? 'yes' : 'no'}`);
    for (const action of result.actions) console.log(`- ${action}`);
    for (const file of result.backups) console.log(`backup: ${file}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
