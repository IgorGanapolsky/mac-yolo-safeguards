#!/usr/bin/env node
'use strict';

// Sandbox VM memory check. Sandboxed agent runtimes (NVIDIA OpenShell, Docker,
// Podman, Lima, OrbStack) run agents inside a Linux VM. macOS shows that VM as one
// process, com.apple.Virtualization.VirtualMachine, whose resident memory looks
// small while its real footprint is the whole guest RAM. This names the VM, says
// how much the containers inside actually use, and points out idle agent sandboxes.
// Read-only: it never stops a container or a VM.

const { execFileSync } = require('child_process');

const GB = 1024;
const SLACK_WARN_MB = 2 * GB;
const AGENT_RE = /openshell|claude|codex|opencode|cursor|agent|sandbox|aider|goose/i;

const VM_PATTERNS = [
  { re: /com\.apple\.Virtualization\.VirtualMachine/, kind: 'Apple Virtualization VM' },
  { re: /(^|\/)qemu-system-/, kind: 'QEMU VM' },
  { re: /(^|\/)(vfkit|krunkit)( |$)/, kind: 'vfkit VM' },
];

// Which tool owns the VM, from what else is running.
const ENGINES = [
  { name: 'OpenShell', re: /(^|\/)openshell( |$)|openshell-(gateway|supervisor)/ },
  { name: 'Docker', re: /com\.docker\.(virtualization|backend)/ },
  { name: 'OrbStack', re: /OrbStack/ },
  { name: 'Podman', re: /(^|\/)(podman|gvproxy)( |$)/ },
  { name: 'Lima', re: /(^|\/)limactl .*(start|hostagent)|lima-hostagent/ },
];

function run(cmd, args, timeout = 5000) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function parsePs(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (m) out.push({ pid: Number(m[1]), rssMB: Math.round(Number(m[2]) / 1024), command: m[3] });
  }
  return out;
}

function parseTopFootprints(text) {
  const units = { B: 1 / 1048576, K: 1 / 1024, M: 1, G: 1024 };
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+([\d.]+)([BKMG])[+-]?\s*$/);
    if (m) out.set(Number(m[1]), Math.round(Number(m[2]) * units[m[3]]));
  }
  return out;
}

function toMB(s) {
  const m = String(s || '').match(/([\d.]+)\s*([KMGT]?i?B)/i);
  if (!m) return 0;
  const f = { B: 1 / 1048576, KIB: 1 / 1024, KB: 1 / 1024, MIB: 1, MB: 1, GIB: 1024, GB: 1024, TIB: 1048576, TB: 1048576 }[m[2].toUpperCase()] || 0;
  return Math.round(Number(m[1]) * f);
}

// `docker stats --no-stream --format '{{json .}}'` lines.
function parseDockerStats(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      const [used, limit] = String(j.MemUsage || '').split('/');
      out.push({
        name: j.Name,
        memoryMB: toMB(used),
        vmMemoryMB: toMB(limit),
        cpuPct: Number(String(j.CPUPerc || '0').replace('%', '')) || 0,
        agent: AGENT_RE.test(j.Name || ''),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

function mb(n) {
  return n >= GB ? `${(n / GB).toFixed(1)} GB` : `${n} MB`;
}

function scan(opts = {}) {
  const procs = parsePs(opts.psText ?? run('ps', ['-axo', 'pid=,rss=,command=']));
  const vms = procs
    .map((p) => ({ ...p, vm: VM_PATTERNS.find((v) => v.re.test(p.command)) }))
    .filter((p) => p.vm);
  const footprints = vms.length ? parseTopFootprints(opts.topText ?? run('/usr/bin/top', ['-l', '1', '-o', 'mem', '-n', '5000', '-stats', 'pid,mem'], 20000)) : new Map();
  const engines = ENGINES.filter((e) => procs.some((p) => e.re.test(p.command))).map((e) => e.name);
  const containers = engines.includes('Docker') || opts.dockerText != null
    ? parseDockerStats(opts.dockerText ?? run('docker', ['stats', '--no-stream', '--format', '{{json .}}'], 8000))
    : [];

  const vmList = vms.map((p) => ({
    pid: p.pid,
    kind: p.vm.kind,
    footprintMB: footprints.get(p.pid) ?? p.rssMB,
    residentMB: p.rssMB,
  }));
  const vmMB = vmList.reduce((s, v) => s + v.footprintMB, 0);
  const containerMB = containers.reduce((s, c) => s + c.memoryMB, 0);
  const owner = engines.length ? engines.join(' + ') : 'an unknown tool';

  const advice = [];
  if (vmList.length && containers.length && vmMB - containerMB >= SLACK_WARN_MB) {
    advice.push({
      level: 'warn',
      text: `${owner}'s VM holds ${mb(vmMB)} of RAM, but its containers use ${mb(containerMB)}. Lower the VM's memory limit (Docker: Settings > Resources) or quit ${owner} when you don't need it.`,
    });
  } else if (vmList.length && !containers.length && vmMB >= SLACK_WARN_MB) {
    advice.push({ level: 'info', text: `A sandbox VM (${owner}) holds ${mb(vmMB)} of RAM. Quit it when no sandboxed agent is running.` });
  }
  const idleAgents = containers.filter((c) => c.agent && c.cpuPct < 0.5);
  if (idleAgents.length) {
    advice.push({
      level: 'info',
      text: `Idle agent sandboxes: ${idleAgents.map((c) => `${c.name} (${mb(c.memoryMB)})`).join(', ')}. Delete them when done (openshell sandbox delete <name>, or docker stop <name>).`,
    });
  }

  return { ok: true, engines, vms: vmList, vmMemoryMB: vmMB, containers, containerMemoryMB: containerMB, advice };
}

module.exports = { scan, parseDockerStats, parsePs, parseTopFootprints, toMB };

if (require.main === module) {
  const r = scan();
  if (process.argv.includes('--text')) {
    if (!r.vms.length) console.log('No sandbox VM is running.');
    for (const v of r.vms) console.log(`${v.kind} (${r.engines.join(' + ') || 'unknown'}): ${mb(v.footprintMB)} of RAM (only ${mb(v.residentMB)} of it shows as resident memory)`);
    if (r.containers.length) console.log(`Containers inside use ${mb(r.containerMemoryMB)}:`);
    for (const c of r.containers) console.log(`  ${c.name}${c.agent ? ' [agent]' : ''} ${mb(c.memoryMB)} CPU ${c.cpuPct}%`);
    for (const a of r.advice) console.log(`${a.level === 'warn' ? 'Warning' : 'Tip'}: ${a.text}`);
  } else {
    console.log(JSON.stringify(r, null, 2));
  }
}
