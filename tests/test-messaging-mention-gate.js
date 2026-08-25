#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');
const {
  COUNSEL_CLEARANCE,
  FLOOR_COMMANDS,
  gateMessage,
  sessionKey,
  slashAccess,
  stripMention,
  catalog,
  honesty,
  normalizePolicy,
} = require('../tools/messaging-mention-gate');

const TOOL = path.join(__dirname, '..', 'tools', 'messaging-mention-gate.js');
const BIN = path.join(__dirname, '..', 'bin', 'messaging-mention-gate');

const USER = '3uo8dkh1p7g1mfk49ear5fzs5c';
const OTHER = '8fk2jd9s0a7bncm1xqw4tp6r3e';
const OPS = 'abc123def456ghi789jkl012mno';
const INCIDENT = 'xyz987uvw654rst321opq098nml';
const STRANGER_CH = 'not-on-the-list-channel';

const policy = {
  allowedUsers: [USER, OTHER],
  allowedChannels: [OPS, INCIDENT],
  requireMention: true,
  groupSessionsPerUser: true,
  replyMode: 'off',
  botUsername: 'hermes',
  channelPrompts: {
    [OPS]: 'You are on-call. Be terse.',
  },
};

function cli(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
}

console.log('=== test-messaging-mention-gate ===');

assert.equal(COUNSEL_CLEARANCE, false);
assert.deepEqual(FLOOR_COMMANDS, ['help', 'whoami']);

const hon = honesty();
assert.equal(hon.clonedMattermost, false);
assert.equal(hon.liveBot, false);
assert.equal(hon.aiohttpWebsocket, false);
assert.equal(hon.sku, false);
assert.equal(hon.counselClearance, false);
assert.ok(hon.steal.some((s) => /empty ALLOWED_USERS/i.test(s)));
assert.ok(hon.skip.some((s) => /aiohttp/i.test(s)));
assert.ok(hon.skip.some((s) => /\$499/.test(s)));

const cat = catalog();
assert.equal(cat.ok, true);
assert.equal(cat.apply, false);

// 1. Empty allowlist denies everyone, including a DM with a mention.
const empty = gateMessage(
  { channelType: 'direct', userId: USER, text: '@hermes hi', mentioned: true },
  { allowedUsers: [] },
);
assert.equal(empty.respond, false);
assert.equal(empty.drop, 'empty_allowlist');
assert.equal(empty.persistToTranscript, false);

const unsetUsers = gateMessage(
  { channelType: 'dm', userId: USER, text: 'hi' },
  {},
);
assert.equal(unsetUsers.drop, 'empty_allowlist');

// 2. User not on the list is denied even when mentioned in an allowed channel.
const stranger = gateMessage(
  { channelType: 'O', userId: 'nope', channelId: OPS, text: '@hermes ping', mentioned: true },
  policy,
);
assert.equal(stranger.drop, 'user_not_allowed');
assert.equal(stranger.respond, false);

// 3. DMs from allowed users always respond; mention is not required.
const dm = gateMessage(
  { channelType: 'direct', userId: USER, channelId: 'dm-1', text: 'status please' },
  policy,
);
assert.equal(dm.respond, true);
assert.equal(dm.dm, true);
assert.equal(dm.sessionKey, `dm:${USER}`);
assert.equal(dm.processedText, 'status please');
assert.equal(dm.ephemeralSystemPrompt, null);
assert.equal(dm.persistToTranscript, false);
assert.equal(dm.replyIn, 'channel');
assert.equal(dm.clonedMattermost, false);

// 4. Channel without mention is ignored.
const quiet = gateMessage(
  { channelType: 'O', userId: USER, channelId: OPS, text: 'just chatting' },
  policy,
);
assert.equal(quiet.respond, false);
assert.equal(quiet.drop, 'need_mention');

// 5. Channel with @mention responds and strips the mention.
const ping = gateMessage(
  { channelType: 'O', userId: USER, channelId: OPS, text: '@hermes deploy status' },
  policy,
);
assert.equal(ping.respond, true);
assert.equal(ping.mentioned, true);
assert.equal(ping.processedText, 'deploy status');
assert.equal(ping.ephemeralSystemPrompt, 'You are on-call. Be terse.');
assert.equal(ping.persistToTranscript, false);
assert.equal(ping.sessionKey, `channel:${OPS}:user:${USER}`);

// Mention strip does not leak into the prompt field.
assert.equal(stripMention('@hermes please look', normalizePolicy(policy)), 'please look');

// 6. allowed_channels drops unlisted channels BEFORE mention gating (even @mentioned).
const offChannel = gateMessage(
  { channelType: 'O', userId: USER, channelId: STRANGER_CH, text: '@hermes emergency', mentioned: true },
  policy,
);
assert.equal(offChannel.respond, false);
assert.equal(offChannel.drop, 'channel_not_allowed');

// DMs are exempt from allowed_channels.
const dmExempt = gateMessage(
  { channelType: 'D', userId: USER, channelId: 'random-dm', text: 'hello from dm' },
  policy,
);
assert.equal(dmExempt.respond, true);
assert.equal(dmExempt.dm, true);

// Empty allowed_channels = unrestricted (backward compatible).
const open = gateMessage(
  { channelType: 'O', userId: USER, channelId: STRANGER_CH, text: '@hermes hi' },
  { allowedUsers: [USER], allowedChannels: [], botUsername: 'hermes' },
);
assert.equal(open.respond, true);

// 7. FREE_RESPONSE_CHANNELS skip the mention requirement.
const free = gateMessage(
  { channelType: 'P', userId: USER, channelId: OPS, text: 'no mention needed' },
  Object.assign({}, policy, { freeResponseChannels: [OPS] }),
);
assert.equal(free.respond, true);
assert.equal(free.mentioned, false);

// REQUIRE_MENTION=false also skips.
const anyMsg = gateMessage(
  { channelType: 'O', userId: USER, channelId: OPS, text: 'broadcast' },
  Object.assign({}, policy, { requireMention: false }),
);
assert.equal(anyMsg.respond, true);

// 8. Session namespaces: two users in one channel do not share a transcript.
const a = sessionKey(
  { channelType: 'O', channelId: OPS, userId: USER },
  { groupSessionsPerUser: true },
);
const b = sessionKey(
  { channelType: 'O', channelId: OPS, userId: OTHER },
  { groupSessionsPerUser: true },
);
assert.equal(a, `channel:${OPS}:user:${USER}`);
assert.equal(b, `channel:${OPS}:user:${OTHER}`);
assert.notEqual(a, b);

const shared = sessionKey(
  { channelType: 'O', channelId: OPS, userId: USER },
  { groupSessionsPerUser: false },
);
const shared2 = sessionKey(
  { channelType: 'O', channelId: OPS, userId: OTHER },
  { groupSessionsPerUser: false },
);
assert.equal(shared, `channel:${OPS}`);
assert.equal(shared, shared2);

const threadA = sessionKey(
  { channelType: 'O', channelId: OPS, userId: USER, threadId: 't1' },
  { groupSessionsPerUser: true },
);
const threadB = sessionKey(
  { channelType: 'O', channelId: OPS, userId: OTHER, threadId: 't1' },
  { groupSessionsPerUser: true },
);
assert.equal(threadA, 'thread:t1:user:' + USER);
assert.notEqual(threadA, threadB);
assert.equal(
  sessionKey({ channelType: 'O', channelId: OPS, userId: USER, threadId: 't1' }, { groupSessionsPerUser: false }),
  'thread:t1',
);

// 9. reply_mode thread vs off (unknown values → off).
assert.equal(
  gateMessage(
    { channelType: 'O', userId: USER, channelId: OPS, text: '@hermes x' },
    Object.assign({}, policy, { replyMode: 'thread' }),
  ).replyIn,
  'thread',
);
assert.equal(
  gateMessage(
    { channelType: 'O', userId: USER, channelId: OPS, text: '@hermes x' },
    Object.assign({}, policy, { replyMode: 'nope' }),
  ).replyMode,
  'off',
);

// 10. Slash split: unset allow_admin_from = every allowed user can run every command.
const compat = slashAccess(
  { channelType: 'direct', userId: USER, text: '/yolo' },
  normalizePolicy({ allowedUsers: [USER] }),
);
assert.equal(compat.allow, true);
assert.equal(compat.reason, 'compat_unrestricted');

const splitPolicy = normalizePolicy({
  allowedUsers: [USER, OTHER],
  allowAdminFrom: [USER],
  userAllowedCommands: ['status'],
});
assert.equal(slashAccess({ channelType: 'dm', userId: USER, text: '/yolo' }, splitPolicy).allow, true);
assert.equal(slashAccess({ channelType: 'dm', userId: USER, text: '/yolo' }, splitPolicy).admin, true);
assert.equal(slashAccess({ channelType: 'dm', userId: OTHER, text: '/help' }, splitPolicy).allow, true);
assert.equal(slashAccess({ channelType: 'dm', userId: OTHER, text: '/whoami' }, splitPolicy).allow, true);
assert.equal(slashAccess({ channelType: 'dm', userId: OTHER, text: '/status' }, splitPolicy).allow, true);
assert.equal(slashAccess({ channelType: 'dm', userId: OTHER, text: '/yolo' }, splitPolicy).allow, false);
assert.equal(slashAccess({ channelType: 'dm', userId: OTHER, text: '/sethome' }, splitPolicy).allow, false);

const userYolo = gateMessage(
  { channelType: 'direct', userId: OTHER, text: '/yolo' },
  {
    allowedUsers: [USER, OTHER],
    allowAdminFrom: [USER],
    userAllowedCommands: ['status'],
  },
);
assert.equal(userYolo.respond, false);
assert.equal(userYolo.drop, 'slash_not_allowed');

const userHelp = gateMessage(
  { channelType: 'direct', userId: OTHER, text: '/help' },
  {
    allowedUsers: [USER, OTHER],
    allowAdminFrom: [USER],
    userAllowedCommands: ['status'],
  },
);
assert.equal(userHelp.respond, true);
assert.equal(userHelp.slash.command, 'help');

// Group-scope lists apply in channels.
const groupSplit = normalizePolicy({
  allowedUsers: [USER, OTHER],
  allowedChannels: [OPS],
  allowAdminFrom: [USER],
  userAllowedCommands: ['status'],
  groupAllowAdminFrom: [],
  groupUserAllowedCommands: ['help'],
  botUsername: 'hermes',
});
assert.equal(
  slashAccess({ channelType: 'O', channelId: OPS, userId: USER, text: '/yolo' }, groupSplit).allow,
  false,
);
assert.equal(
  slashAccess({ channelType: 'O', channelId: OPS, userId: OTHER, text: '/help' }, groupSplit).allow,
  true,
);

// 11. Channel prompt must never be treated as transcript text.
assert.notEqual(ping.processedText, ping.ephemeralSystemPrompt);
assert.equal(ping.persistToTranscript, false);

// 12. CLI: honesty + gate. Default argv must honor flags (Codex P2 lesson).
const honestyCli = cli(['--honesty', '--json']);
assert.equal(honestyCli.status, 0, honestyCli.stderr);
const honestyJson = JSON.parse(honestyCli.stdout);
assert.equal(honestyJson.liveBot, false);
assert.equal(honestyJson.clonedMattermost, false);

const dmCli = cli([
  '--gate',
  '--json',
  '--channel-type', 'direct',
  '--user-id', USER,
  '--text', 'hello',
  '--allowed-users', USER,
]);
assert.equal(dmCli.status, 0, dmCli.stderr);
const dmJson = JSON.parse(dmCli.stdout);
assert.equal(dmJson.respond, true);
assert.equal(dmJson.sessionKey, `dm:${USER}`);

const denyCli = cli([
  '--gate',
  '--json',
  '--channel-type', 'O',
  '--user-id', USER,
  '--channel-id', OPS,
  '--text', 'no mention',
  '--allowed-users', USER,
  '--allowed-channels', OPS,
]);
assert.equal(denyCli.status, 1);
assert.equal(JSON.parse(denyCli.stdout).drop, 'need_mention');

const emptyCli = cli(['--gate', '--json', '--channel-type', 'dm', '--user-id', USER, '--text', 'x']);
assert.equal(JSON.parse(emptyCli.stdout).drop, 'empty_allowlist');

const bin = spawnSync(BIN, ['--catalog', '--json'], { encoding: 'utf8' });
assert.equal(bin.status, 0, bin.stderr);
assert.equal(JSON.parse(bin.stdout).schema, 'messaging-mention-gate/v1');

const badJson = cli(['--gate', '--json', '--event', '{']);
assert.equal(badJson.status, 2);
assert.equal(JSON.parse(badJson.stdout).drop, 'invalid_json');

console.log('ok');
