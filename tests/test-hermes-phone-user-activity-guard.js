#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-phone-guard-'));
process.env.HERMES_GLOBAL_PHONE_LOCK_DIR = tempRoot;

const {
  physicalPhoneUserActivity,
  runCommandWithPhonePipelineLock,
} = require('../tools/agent-phone-pipeline-lock.js');

function result(status, stdout = '') {
  return { status, stdout, stderr: '' };
}

function mockAdb({ devices, power = '', window = '' }) {
  return (_command, args) => {
    if (args[0] === 'devices') return result(0, devices);
    if (args.includes('power')) return result(0, power);
    if (args.includes('window')) return result(0, window);
    return result(1);
  };
}

let activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({ devices: 'List of devices attached\nemulator-5554 device\n' }),
});
assert.equal(activity.active, false);
assert.equal(activity.reason, 'no physical phone');

activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({
    devices: 'List of devices attached\nPHONE123 device usb:1\n',
    power: 'mWakefulness=Asleep\n',
  }),
});
assert.equal(activity.active, false);
assert.equal(activity.serial, 'PHONE123');

activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({
    devices: 'List of devices attached\nPHONE123 device usb:1\n',
    power: 'mWakefulness=Awake\n',
    window: 'mCurrentFocus=Window{abc u0 com.iganapolsky.hermesmobile/com.iganapolsky.hermesmobile.MainActivity}\n',
  }),
});
assert.equal(activity.active, true);
assert.equal(activity.foregroundPackage, 'com.iganapolsky.hermesmobile');

let nestedSawLock = false;
const commandResult = runCommandWithPhonePipelineLock(
  'continuous-e2e-test',
  'true',
  [],
  {
    spawnSyncImpl: () => {
      nestedSawLock = fs.existsSync(path.join(tempRoot, 'agent-phone-pipeline.lockdir'));
      return result(0);
    },
    stdio: 'pipe',
    pipelineBusyReasonImpl: () => '',
  },
);
assert.equal(commandResult.status, 0);
assert.equal(nestedSawLock, true);
assert.equal(fs.existsSync(path.join(tempRoot, 'agent-phone-pipeline.lockdir')), false);

console.log('PASS: physical-phone activity and unified lease guards');
