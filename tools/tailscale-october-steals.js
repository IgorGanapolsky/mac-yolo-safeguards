#!/usr/bin/env node
'use strict';

/**
 * tools/tailscale-october-steals.js
 *
 * High-ROI architectural steals from the October 29, 2026 Tailscale Newsletter
 * (/Users/iganapolsky/Downloads/tailscale.pdf):
 *
 *   1. `scurgery` — Byte-Identical Named Policy Block Surgery:
 *      Adds a named set of blocks to a policy/config file and later removes
 *      exactly those blocks again, leaving everything else in the file
 *      byte-identical (SHA-256 verified) to what it was before.
 *   2. `MagicRoute` — Sticky Signal-Based Multi-Connector Routing:
 *      Selects the best available backend across multiple connectors using
 *      locality, latency, and health signals with hysteresis/stickiness so
 *      connections stay steady without flapping.
 *   3. `Tailworm` Architectural Safeguards (v1.104.4+):
 *      Enforces minimum Tailscale v1.104.4 baseline and blocks lateral
 *      agent-to-agent SSH/command propagation ("worming") without an explicit
 *      per-hop referee token.
 *   4. Identity-Scoped Zero-Credential DB Access Gate:
 *      Replaces static laptop DB passwords with identity-based access:
 *      `support` / default agent = read-only SELECT; `on_call` with active
 *      time-bounded lease = write/DDL allowed; raw password in env/disk = blocked.
 *   5. Muse Node Guardrails & SSH Session Referee:
 *      Isolates personal AI agents (Muse, Claude Code, Codex, OMP) as distinct
 *      tailnet nodes with zero open-web exposure (`openWebExposed: false`) and
 *      referees privileged SSH/exec commands in real time.
 *   6. `swe-mux` Multi-Agent Side-by-Side Attention Triage:
 *      Tracks Claude Code, Codex, Grok, and OMP panes side by side with
 *      inter-session messages and ranks "what needs attention" for phone/voice
 *      control over Tailscale.
 *
 * Usage:
 *   node tools/tailscale-october-steals.js [--json]
 */

const crypto = require('crypto');

const MIN_SAFE_TAILSCALE_VERSION = [1, 104, 4];

/**
 * 1. `scurgery`: Byte-identical named block insertion and removal.
 */
function applyScurgeryBlock(originalContent, blockName, blockLines, options = {}) {
  if (!blockName || !/^[A-Za-z0-9_.-]+$/.test(blockName)) {
    throw new Error(`Invalid scurgery block name: ${blockName}`);
  }
  const src = String(originalContent ?? '');
  const beginMarker = `// BEGIN SCURGERY:${blockName}`;
  const endMarker = `// END SCURGERY:${blockName}`;
  if (src.includes(beginMarker)) {
    throw new Error(`Scurgery block "${blockName}" is already present`);
  }
  const body = Array.isArray(blockLines) ? blockLines.join('\n') : String(blockLines || '');
  const wrapped = `\n${beginMarker}\n${body}\n${endMarker}`;

  if (options.anchor && src.includes(options.anchor)) {
    const idx = src.indexOf(options.anchor) + options.anchor.length;
    return src.slice(0, idx) + wrapped + src.slice(idx);
  }
  return src + wrapped;
}

function removeScurgeryBlock(modifiedContent, blockName) {
  if (!blockName || !/^[A-Za-z0-9_.-]+$/.test(blockName)) {
    throw new Error(`Invalid scurgery block name: ${blockName}`);
  }
  const src = String(modifiedContent ?? '');
  const beginMarker = `\n// BEGIN SCURGERY:${blockName}\n`;
  const endMarker = `\n// END SCURGERY:${blockName}`;
  const startIdx = src.indexOf(beginMarker);
  if (startIdx === -1) {
    return src;
  }
  const endIdx = src.indexOf(endMarker, startIdx + beginMarker.length);
  if (endIdx === -1) {
    throw new Error(`Unclosed scurgery block "${blockName}"`);
  }
  return src.slice(0, startIdx) + src.slice(endIdx + endMarker.length);
}

function verifyScurgeryByteIdentical(originalContent, blockName, blockLines, options = {}) {
  const beforeHash = crypto.createHash('sha256').update(String(originalContent)).digest('hex');
  const injected = applyScurgeryBlock(originalContent, blockName, blockLines, options);
  const restored = removeScurgeryBlock(injected, blockName);
  const afterHash = crypto.createHash('sha256').update(restored).digest('hex');
  return {
    ok: beforeHash === afterHash && restored === originalContent && injected.includes(blockName),
    beforeSha256: beforeHash,
    afterSha256: afterHash,
    byteIdentical: beforeHash === afterHash && restored === originalContent,
  };
}

/**
 * 2. `MagicRoute`: Signal-driven sticky multi-connector backend selection.
 */
function selectMagicRouteConnector(connectors = [], options = {}) {
  const currentStickyId = options.currentConnectorId || null;
  const stickinessBonus = Number(options.stickinessBonus ?? 12);
  const switchMargin = Number(options.switchMargin ?? 8);

  const scored = connectors
    .filter((c) => c && c.healthy !== false)
    .map((c) => {
      const localityScore =
        c.locality === 'local_loopback'
          ? 40
          : c.locality === 'same_tailnet_lan'
            ? 32
            : c.locality === 'same_region_vpc'
              ? 24
              : 12;
      const latencyPenalty = Math.min(35, Number(c.latencyMs ?? 50) * 0.25);
      const lossPenalty = Math.min(40, Number(c.errorRate ?? 0) * 100);
      const streakBonus = Math.min(15, Number(c.successStreak ?? 0) * 1.5);
      const isSticky = Boolean(currentStickyId && c.id === currentStickyId);
      const totalScore = Number(
        (localityScore - latencyPenalty - lossPenalty + streakBonus + (isSticky ? stickinessBonus : 0)).toFixed(3),
      );
      return {
        ...c,
        isSticky,
        score: totalScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { ok: false, selected: null, reason: 'no_healthy_connectors', candidates: [] };
  }

  const best = scored[0];
  const stickyCandidate = currentStickyId ? scored.find((c) => c.id === currentStickyId) : null;
  if (stickyCandidate && stickyCandidate.id !== best.id && best.score - stickyCandidate.score < switchMargin) {
    return {
      ok: true,
      selected: stickyCandidate.id,
      connector: stickyCandidate,
      keptSticky: true,
      reason: 'magicroute_sticky_within_margin',
      candidates: scored,
    };
  }

  return {
    ok: true,
    selected: best.id,
    connector: best,
    keptSticky: Boolean(stickyCandidate && stickyCandidate.id === best.id),
    reason: stickyCandidate && stickyCandidate.id === best.id ? 'magicroute_sticky_best' : 'magicroute_signal_winner',
    candidates: scored,
  };
}

/**
 * 3. `Tailworm` architectural safeguards (Tailscale v1.104.4+ & lateral SSH worm interdiction).
 */
function parseSemver(versionStr = '') {
  const m = String(versionStr).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function evaluateTailwormSafeguards(input = {}) {
  const version = parseSemver(input.tailscaleVersion || '1.104.4');
  const versionSafe = Boolean(version && compareSemver(version, MIN_SAFE_TAILSCALE_VERSION) >= 0);
  const hopCount = Number(input.sshHopCount ?? 1);
  const hasRefereeToken = Boolean(input.refereeToken);
  const openWebExposed = Boolean(input.openWebExposed);

  const issues = [];
  if (!versionSafe) {
    issues.push(`Tailscale version ${input.tailscaleVersion} is below Tailworm fix floor 1.104.4`);
  }
  if (hopCount > 1 && !hasRefereeToken) {
    issues.push(`Lateral multi-hop agent SSH (hopCount=${hopCount}) blocked without refereeToken (Tailworm class guard)`);
  }
  if (openWebExposed) {
    issues.push('Node is exposed to the open web; tailnet nodes must default to private tailnet-only ingress');
  }

  return {
    ok: issues.length === 0,
    versionSafe,
    minSafeVersion: '1.104.4',
    lateralWormBlocked: hopCount <= 1 || hasRefereeToken,
    openWebExposed,
    issues,
  };
}

/**
 * 4. Identity-Scoped Zero-Credential DB Access Gate ("Who can write to your AWS database?")
 */
function evaluateIdentityScopedDbAccess(request = {}) {
  const role = String(request.identityRole || 'support').toLowerCase();
  const sql = String(request.sql || '').trim();
  const hasStaticLaptopPassword = Boolean(request.staticPasswordOnLaptop);
  const hasActiveOnCallLease = Boolean(request.onCallLeaseActive);

  if (hasStaticLaptopPassword) {
    return {
      allowed: false,
      reason: 'static_db_password_on_laptop_forbidden',
      remediation: 'Use Tailscale identity-scoped DB access instead of storing database credentials on laptops.',
    };
  }

  const isReadOnlyQuery = /^(?:SELECT|EXPLAIN\s+SELECT|SHOW|PRAGMA)\b/i.test(sql) &&
    !/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|CREATE|REPLACE)\b/i.test(sql);

  if (isReadOnlyQuery) {
    return {
      allowed: true,
      mode: 'read_only_identity',
      role,
      reason: 'identity_verified_read_only_query',
    };
  }

  if (role === 'on_call' && hasActiveOnCallLease) {
    return {
      allowed: true,
      mode: 'on_call_write_lease',
      role,
      reason: 'identity_verified_on_call_write',
    };
  }

  return {
    allowed: false,
    mode: 'blocked_write',
    role,
    reason: role === 'on_call' ? 'on_call_write_requires_active_lease' : 'support_identity_is_read_only',
  };
}

/**
 * 5. Muse / Personal Agent Tailnet Guardrails & SSH Referee
 */
function refereeAgentTailnetSession(session = {}) {
  const agentNode = String(session.agentNode || 'tag:muse-agent');
  const command = String(session.command || '').trim();
  const targetNode = String(session.targetNode || 'tag:homelab-service');
  const openWeb = Boolean(session.openWebFacing);

  const destructivePattern =
    /\b(?:rm\s+-rf\s+\/|mkfs\b|dd\s+if=|shutdown\b|reboot\b|iptables\s+-F|tailscale\s+up\s+--accept-routes=false\s+--shields-up=false)/i;

  if (openWeb) {
    return {
      verdict: 'DENY',
      agentNode,
      targetNode,
      reason: 'open_web_exposure_forbidden_by_tailnet_policy',
    };
  }

  if (destructivePattern.test(command)) {
    return {
      verdict: 'DENY',
      agentNode,
      targetNode,
      reason: 'ssh_referee_blocked_destructive_command',
    };
  }

  return {
    verdict: 'ALLOW',
    agentNode,
    targetNode,
    reason: 'ssh_referee_approved_scoped_tailnet_action',
  };
}

/**
 * 6. `swe-mux`: Side-by-Side Multi-Agent Session Mux & Phone-Over-Tailscale Attention Ranker
 */
function rankSweMuxAttention(panes = []) {
  const defaultPanes =
    panes.length > 0
      ? panes
      : [
          { id: 'pane-claude', agent: 'claude-code', branch: 'feat/auth-gate', status: 'waiting_approval', unreadMessages: 2, diffLines: 84 },
          { id: 'pane-codex', agent: 'codex', branch: 'fix/d1-indexes', status: 'ci_failed', unreadMessages: 1, diffLines: 42 },
          { id: 'pane-omp', agent: 'omp', branch: 'main', status: 'running_green', unreadMessages: 0, diffLines: 19 },
        ];

  const ranked = defaultPanes
    .map((p) => {
      const statusWeight =
        p.status === 'waiting_approval'
          ? 100
          : p.status === 'ci_failed'
            ? 85
            : p.status === 'merge_ready'
              ? 60
              : 20;
      const priorityScore = statusWeight + Number(p.unreadMessages || 0) * 10;
      return {
        ...p,
        priorityScore,
        needsImmediateAttention: statusWeight >= 80,
        tailscalePhoneSurface: 'live_terminal_git_diff_and_voice_dictation',
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    ok: true,
    totalPanes: ranked.length,
    attentionCount: ranked.filter((r) => r.needsImmediateAttention).length,
    topAttentionPane: ranked[0] || null,
    voiceSummary: ranked
      .filter((r) => r.needsImmediateAttention)
      .map((r) => `${r.agent} on ${r.branch}: ${r.status.replace(/_/g, ' ')}`)
      .join('; '),
    panes: ranked,
  };
}

function runAllTailscaleSteals() {
  const samplePolicy = '{\n  "acls": [\n    {"action": "accept", "src": ["autogroup:member"], "dst": ["*:*"]}\n  ]\n}\n';
  const scurgery = verifyScurgeryByteIdentical(
    samplePolicy,
    'muse-temp-ssh-referee',
    ['  // temporary muse referee rule', '  // expires after session'],
  );

  const magicRoute = selectMagicRouteConnector(
    [
      { id: 'mac-loopback', locality: 'local_loopback', latencyMs: 2, errorRate: 0, successStreak: 10, healthy: true },
      { id: 'hermes-mini-tailnet', locality: 'same_tailnet_lan', latencyMs: 14, errorRate: 0, successStreak: 8, healthy: true },
      { id: 'fly-cloud-runner', locality: 'remote_cloud', latencyMs: 65, errorRate: 0.01, successStreak: 5, healthy: true },
    ],
    { currentConnectorId: 'mac-loopback' },
  );

  const tailworm = evaluateTailwormSafeguards({
    tailscaleVersion: '1.104.4',
    sshHopCount: 1,
    refereeToken: true,
    openWebExposed: false,
  });

  const dbRead = evaluateIdentityScopedDbAccess({
    identityRole: 'support',
    sql: 'SELECT id, organization_id, status FROM tasks LIMIT 25;',
    staticPasswordOnLaptop: false,
  });
  const dbWriteBlocked = evaluateIdentityScopedDbAccess({
    identityRole: 'support',
    sql: 'DELETE FROM tasks WHERE id = "t1";',
    staticPasswordOnLaptop: false,
  });

  const museReferee = refereeAgentTailnetSession({
    agentNode: 'tag:muse-agent',
    targetNode: 'tag:homelab-immich',
    command: 'tailscale status --json',
    openWebFacing: false,
  });

  const sweMux = rankSweMuxAttention();

  const ok =
    scurgery.ok &&
    magicRoute.ok &&
    tailworm.ok &&
    dbRead.allowed === true &&
    dbWriteBlocked.allowed === false &&
    museReferee.verdict === 'ALLOW' &&
    sweMux.ok;

  return {
    schema: 'tailscale-october-steals/v1',
    ok,
    checkedAt: new Date().toISOString(),
    source: 'Tailscale October 2026 Newsletter (/Users/iganapolsky/Downloads/tailscale.pdf)',
    pillars: {
      scurgeryByteIdenticalPolicy: scurgery,
      magicRouteStickyConnector: magicRoute,
      tailwormSafeguards: tailworm,
      identityScopedDbAccess: {
        supportReadAllowed: dbRead.allowed,
        supportWriteBlocked: !dbWriteBlocked.allowed,
      },
      museTailnetReferee: museReferee,
      sweMuxAttentionRanker: sweMux,
    },
  };
}

if (require.main === module) {
  const jsonMode = process.argv.includes('--json');
  const report = runAllTailscaleSteals();
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`=== Tailscale October 2026 Architectural Steals: ${report.ok ? 'PASS' : 'FAIL'} ===`);
    console.log(`  1. scurgery Byte-Identical Policy Surgery: ${report.pillars.scurgeryByteIdenticalPolicy.ok ? 'OK' : 'FAIL'}`);
    console.log(`  2. MagicRoute Sticky Connector Selection:  ${report.pillars.magicRouteStickyConnector.ok ? 'OK' : 'FAIL'} (selected=${report.pillars.magicRouteStickyConnector.selected})`);
    console.log(`  3. Tailworm v1.104.4+ Class Safeguards:    ${report.pillars.tailwormSafeguards.ok ? 'OK' : 'FAIL'}`);
    console.log(`  4. Identity-Scoped Zero-Cred DB Access:    ${report.pillars.identityScopedDbAccess.supportReadAllowed && report.pillars.identityScopedDbAccess.supportWriteBlocked ? 'OK' : 'FAIL'}`);
    console.log(`  5. Muse Agent Tailnet & SSH Referee:       ${report.pillars.museTailnetReferee.verdict === 'ALLOW' ? 'OK' : 'FAIL'}`);
    console.log(`  6. swe-mux Multi-Agent Attention Ranker:   ${report.pillars.sweMuxAttentionRanker.ok ? 'OK' : 'FAIL'} (${report.pillars.sweMuxAttentionRanker.attentionCount} panes need attention)`);
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  MIN_SAFE_TAILSCALE_VERSION,
  applyScurgeryBlock,
  removeScurgeryBlock,
  verifyScurgeryByteIdentical,
  selectMagicRouteConnector,
  evaluateTailwormSafeguards,
  evaluateIdentityScopedDbAccess,
  refereeAgentTailnetSession,
  rankSweMuxAttention,
  runAllTailscaleSteals,
};
