#!/usr/bin/env node
'use strict';

/**
 * Messaging mention / allowlist / session-namespace gate.
 *
 * Process steal from Nous Hermes Mattermost docs — not a Mattermost bot and
 * not an aiohttp WebSocket adapter. Same policy applies to Telegram/Slack/
 * Discord-style adapters already on this Mac.
 *
 * Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/mattermost
 * Slash split: https://hermes-agent.nousresearch.com/docs/reference/slash-commands
 *
 * ECI: counsel_clearance=false — no $499 outreach, no Mattermost SKU.
 */

const SCHEMA = 'messaging-mention-gate/v1';
const COUNSEL_CLEARANCE = false;
const SOURCE = 'https://hermes-agent.nousresearch.com/docs/user-guide/messaging/mattermost';
const FLOOR_COMMANDS = Object.freeze(['help', 'whoami']);
const DM_TYPES = new Set(['d', 'dm', 'direct', 'direct_message']);

function base() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    counselClearance: COUNSEL_CLEARANCE,
    clonedMattermost: false,
    liveBot: false,
    aiohttpWebsocket: false,
    mattermostCloud: false,
    sku: false,
    apply: false,
  };
}

function listOf(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function asBool(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDirectMessage(event) {
  if (!event) return false;
  if (event.isDm === true || event.direct === true) return true;
  const t = String(event.channelType || event.type || '').trim().toLowerCase();
  return DM_TYPES.has(t);
}

function normalizeCommand(raw) {
  if (!raw) return '';
  return String(raw).trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
}

function extractSlash(event) {
  if (!event) return '';
  if (event.slashCommand) return normalizeCommand(event.slashCommand);
  const text = String(event.text || event.message || '');
  const m = text.match(/^\s*\/([A-Za-z][\w-]*)\b/);
  return m ? m[1].toLowerCase() : '';
}

function botNames(policy) {
  const names = listOf(policy.botUsername).concat(listOf(policy.botAliases));
  if (!names.length) names.push('hermes');
  return names;
}

function textHasMention(event, policy) {
  const text = String(event.text || event.message || '');
  const names = botNames(policy);
  for (const name of names) {
    const re = new RegExp(`(^|\\s)@${escapeRe(name)}\\b`, 'i');
    if (re.test(text)) return true;
  }
  const botId = policy.botUserId || event.botUserId;
  if (botId && new RegExp(`<@${escapeRe(botId)}>`, 'i').test(text)) return true;
  return false;
}

function isMentioned(event, policy) {
  if (event.mentioned === true || event.hasMention === true) return true;
  return textHasMention(event, policy);
}

function stripMention(text, policy, event) {
  let out = String(text || '');
  for (const name of botNames(policy)) {
    out = out.replace(new RegExp(`@${escapeRe(name)}\\b`, 'gi'), '');
  }
  const botId = (policy && policy.botUserId) || (event && event.botUserId);
  if (botId) out = out.replace(new RegExp(`<@${escapeRe(botId)}>`, 'gi'), '');
  return out.replace(/\s+/g, ' ').trim();
}

function normalizePolicy(input) {
  const p = input && typeof input === 'object' ? input : {};
  const allowAdminFrom = Object.prototype.hasOwnProperty.call(p, 'allowAdminFrom')
    ? listOf(p.allowAdminFrom)
    : null;
  const groupAllowAdminFrom = Object.prototype.hasOwnProperty.call(p, 'groupAllowAdminFrom')
    ? listOf(p.groupAllowAdminFrom)
    : null;
  const reply = String(p.replyMode || 'off').trim().toLowerCase();
  return {
    allowedUsers: listOf(p.allowedUsers),
    allowedChannels: listOf(p.allowedChannels),
    freeResponseChannels: listOf(p.freeResponseChannels),
    requireMention: asBool(p.requireMention, true),
    groupSessionsPerUser: asBool(p.groupSessionsPerUser, true),
    replyMode: reply === 'thread' ? 'thread' : 'off',
    channelPrompts: p.channelPrompts && typeof p.channelPrompts === 'object' ? p.channelPrompts : {},
    botUsername: p.botUsername || 'hermes',
    botAliases: listOf(p.botAliases),
    botUserId: p.botUserId || '',
    allowAdminFrom,
    userAllowedCommands: listOf(p.userAllowedCommands).map(normalizeCommand),
    groupAllowAdminFrom,
    groupUserAllowedCommands: listOf(p.groupUserAllowedCommands).map(normalizeCommand),
  };
}

function sessionKey(event, policy) {
  const userId = String((event && event.userId) || '');
  const channelId = String((event && event.channelId) || '');
  const threadId = String((event && (event.threadId || event.rootId)) || '');
  const isolate = policy.groupSessionsPerUser !== false;
  if (isDirectMessage(event)) return `dm:${userId}`;
  if (threadId) {
    return isolate ? `thread:${threadId}:user:${userId}` : `thread:${threadId}`;
  }
  return isolate ? `channel:${channelId}:user:${userId}` : `channel:${channelId}`;
}

function isAdmin(event, policy) {
  const userId = String((event && event.userId) || '');
  if (!userId) return false;
  if (event.isAdmin === true) return true;
  const dm = isDirectMessage(event);
  const list = !dm && policy.groupAllowAdminFrom
    ? policy.groupAllowAdminFrom
    : policy.allowAdminFrom;
  if (!list) return false;
  return list.includes(userId);
}

function slashAccess(event, policy) {
  const command = extractSlash(event);
  if (!command) {
    return { slash: false, command: '', allow: true, reason: 'not_slash' };
  }
  const dm = isDirectMessage(event);
  const adminFrom = !dm && policy.groupAllowAdminFrom != null
    ? policy.groupAllowAdminFrom
    : policy.allowAdminFrom;
  // Unset allow_admin_from → unrestricted backward-compat for allowed users.
  if (adminFrom == null) {
    return { slash: true, command, allow: true, reason: 'compat_unrestricted', admin: isAdmin(event, policy) };
  }
  const admin = isAdmin(event, policy);
  if (admin) {
    return { slash: true, command, allow: true, reason: 'admin', admin: true };
  }
  const userCmds = !dm && policy.groupUserAllowedCommands && policy.groupUserAllowedCommands.length
    ? policy.groupUserAllowedCommands
    : policy.userAllowedCommands;
  const allow = FLOOR_COMMANDS.includes(command) || userCmds.includes(command);
  return {
    slash: true,
    command,
    allow,
    admin: false,
    reason: allow ? 'user_allowed' : 'slash_not_allowed',
  };
}

function drop(code, reason, extra) {
  return Object.assign(base(), {
    ok: true,
    respond: false,
    drop: code,
    reason,
    persistToTranscript: false,
    ephemeralSystemPrompt: null,
  }, extra || {});
}

function gateMessage(event, policyInput) {
  if (!event || typeof event !== 'object') {
    return Object.assign(base(), {
      ok: false,
      respond: false,
      drop: 'invalid_event',
      reason: 'event object required',
    });
  }
  const policy = normalizePolicy(policyInput);
  const userId = String(event.userId || '');
  const channelId = String(event.channelId || '');
  const dm = isDirectMessage(event);

  if (!policy.allowedUsers.length) {
    return drop('empty_allowlist', 'ALLOWED_USERS empty denies all (Nous default)');
  }
  if (!userId || !policy.allowedUsers.includes(userId)) {
    return drop('user_not_allowed', 'user id is not in ALLOWED_USERS', { userId });
  }

  // Channel allowlist runs before mention / free-response gating. DMs exempt.
  if (!dm && policy.allowedChannels.length) {
    if (!channelId || !policy.allowedChannels.includes(channelId)) {
      return drop('channel_not_allowed', 'channel id is not on allowed_channels; DMs remain exempt', {
        channelId,
      });
    }
  }

  const mentioned = isMentioned(event, policy);
  if (!dm && policy.requireMention && !mentioned && !policy.freeResponseChannels.includes(channelId)) {
    return drop('need_mention', 'channels require @mention unless free-response or REQUIRE_MENTION=false', {
      channelId,
      mentioned: false,
    });
  }

  const slash = slashAccess(event, policy);
  if (slash.slash && !slash.allow) {
    return drop('slash_not_allowed', 'command is outside user_allowed_commands (floor is /help /whoami)', {
      command: slash.command,
    });
  }

  const raw = String(event.text || event.message || '');
  const processedText = mentioned ? stripMention(raw, policy, event) : raw.trim();
  const prompt = (!dm && channelId && policy.channelPrompts[channelId]) || null;
  const key = sessionKey(event, policy);

  return Object.assign(base(), {
    ok: true,
    respond: true,
    drop: null,
    dm,
    mentioned,
    userId,
    channelId,
    processedText,
    sessionKey: key,
    replyIn: policy.replyMode === 'thread' ? 'thread' : 'channel',
    replyMode: policy.replyMode,
    ephemeralSystemPrompt: prompt,
    persistToTranscript: false,
    slash: slash.slash ? { command: slash.command, allow: slash.allow, reason: slash.reason, admin: slash.admin } : null,
    groupSessionsPerUser: policy.groupSessionsPerUser,
  });
}

function catalog() {
  return Object.assign(base(), {
    ok: true,
    steal: [
      'empty ALLOWED_USERS denies all',
      'DMs always respond; channels need @mention unless free-response',
      'allowed_channels drop-before-mention; DMs exempt',
      'group_sessions_per_user isolates channel/thread transcripts per user',
      'channel_prompts are ephemeral and never persisted',
      'admin/user slash split with /help /whoami floor',
    ],
    skip: [
      'aiohttp WebSocket Mattermost adapter',
      'Mattermost Cloud / bot-account setup',
      'nginx websocket reconnect loops',
      'live Mattermost server',
      '$499 ThumbGate paid-pilot outreach',
    ],
    floorCommands: FLOOR_COMMANDS.slice(),
    complementaryTo: ['Hermes gateway adapters already on this Mac', 'PR #2046 router-receipt (do not dual-edit)'],
  });
}

function honesty() {
  return catalog();
}

function parseJsonFlag(raw, label) {
  if (raw == null || raw === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalid: label };
  }
}

function parseArgs(argv) {
  const out = {
    json: false,
    honesty: false,
    catalog: false,
    gate: false,
    event: {},
    policy: {},
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--json') out.json = true;
    else if (a === '--honesty') out.honesty = true;
    else if (a === '--catalog') out.catalog = true;
    else if (a === '--gate') out.gate = true;
    else if (a === '--event' && next) { out.event = parseJsonFlag(next, 'event'); i += 1; }
    else if (a === '--policy' && next) { out.policy = parseJsonFlag(next, 'policy'); i += 1; }
    else if (a === '--channel-type' && next) { out.event.channelType = next; i += 1; }
    else if (a === '--user-id' && next) { out.event.userId = next; i += 1; }
    else if (a === '--channel-id' && next) { out.event.channelId = next; i += 1; }
    else if (a === '--thread-id' && next) { out.event.threadId = next; i += 1; }
    else if (a === '--text' && next) { out.event.text = next; i += 1; }
    else if (a === '--mentioned') out.event.mentioned = true;
    else if (a === '--allowed-users' && next) { out.policy.allowedUsers = next; i += 1; }
    else if (a === '--allowed-channels' && next) { out.policy.allowedChannels = next; i += 1; }
    else if (a === '--free-response' && next) { out.policy.freeResponseChannels = next; i += 1; }
    else if (a === '--require-mention' && next) { out.policy.requireMention = next; i += 1; }
    else if (a === '--group-sessions-per-user' && next) { out.policy.groupSessionsPerUser = next; i += 1; }
    else if (a === '--reply-mode' && next) { out.policy.replyMode = next; i += 1; }
    else if (a === '--bot-username' && next) { out.policy.botUsername = next; i += 1; }
    else if (a === '--allow-admin-from' && next) { out.policy.allowAdminFrom = next; i += 1; }
    else if (a === '--user-allowed-commands' && next) { out.policy.userAllowedCommands = next; i += 1; }
  }
  return out;
}

function main(argv = process.argv) {
  const args = parseArgs(Array.isArray(argv) ? argv.slice(2) : process.argv.slice(2));
  let result;
  if (args.event && args.event.__invalid) {
    result = Object.assign(base(), { ok: false, drop: 'invalid_json', reason: 'event is not JSON' });
  } else if (args.policy && args.policy.__invalid) {
    result = Object.assign(base(), { ok: false, drop: 'invalid_json', reason: 'policy is not JSON' });
  } else if (args.honesty || args.catalog) {
    result = honesty();
  } else if (args.gate || args.event.userId || args.event.text || args.event.channelType) {
    result = gateMessage(args.event, args.policy);
  } else {
    result = catalog();
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) return 2;
  if (result.respond === false && args.gate) return 1;
  return 0;
}

module.exports = {
  SCHEMA,
  COUNSEL_CLEARANCE,
  FLOOR_COMMANDS,
  SOURCE,
  isDirectMessage,
  stripMention,
  sessionKey,
  slashAccess,
  normalizePolicy,
  gateMessage,
  catalog,
  honesty,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv) ?? 0);
}
