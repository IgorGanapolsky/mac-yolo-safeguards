#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { opensApps, describeSchedule, parseLaunchctlList, parseDisabled, parseEtime } = require('../tools/mac-yolo-jobs');

// The script that kept reopening the Stripe dashboard in Chrome on Nov 12, 2026.
assert.ok(opensApps('subprocess.run(["open", "-a", "Google Chrome", DASHBOARD])'));
assert.ok(opensApps('open "https://dashboard.stripe.com/payments"'));
assert.ok(opensApps('sleep 60; open -g -a Safari'));
assert.ok(opensApps('import webbrowser\nwebbrowser.open(url)'));
assert.ok(opensApps('tell application "Google Chrome"\n  activate\nend tell'));
assert.ok(!opensApps('curl -s https://api.stripe.com/v1/charges'));
assert.ok(!opensApps('osascript -e \'display notification "paid" with title "Stripe"\''));
assert.ok(!opensApps('const opened = fs.openSync(file)'));

assert.strictEqual(describeSchedule({ StartInterval: 60 }), 'every 1 min');
assert.strictEqual(describeSchedule({ StartInterval: 14400 }), 'every 4h');
assert.strictEqual(describeSchedule({ StartInterval: 45 }), 'every 45s');
assert.strictEqual(describeSchedule({ KeepAlive: true }), 'always running');
assert.strictEqual(describeSchedule({ StartCalendarInterval: { Hour: 9 } }), 'on a schedule');

assert.deepStrictEqual(parseLaunchctlList('PID\tStatus\tLabel\n123\t0\tcom.a\n-\t78\tcom.b\n'), {
  'com.a': { pid: 123, lastExit: 0 },
  'com.b': { pid: null, lastExit: 78 },
});
assert.deepStrictEqual([...parseDisabled('disabled services = {\n\t"com.a" => disabled\n\t"com.b" => enabled\n\t"com.c" => true\n}')], ['com.a', 'com.c']);
assert.strictEqual(parseEtime('03:21:41'), 3 * 3600 + 21 * 60 + 41);
assert.strictEqual(parseEtime('01-04:26:00'), 86400 + 4 * 3600 + 26 * 60);
assert.strictEqual(parseEtime('08:15'), 8 * 60 + 15);

// Live check on a real Mac: a throwaway LaunchAgent and a throwaway loop are listed, flagged,
// paused, resumed and stopped. Run with MAC_YOLO_JOBS_LIVE=1.
if (process.env.MAC_YOLO_JOBS_LIVE === '1' && process.platform === 'darwin') {
  const tool = path.join(__dirname, '..', 'tools', 'mac-yolo-jobs.js');
  const call = (...a) => JSON.parse(execFileSync(process.execPath, [tool, ...a], { encoding: 'utf8', env: { ...process.env, MAC_YOLO_JOBS_MIN_AGE_S: '0' } }));
  const dir = fs.mkdtempSync(path.join(os.homedir(), '.macyolo-jobs-test-'));
  const label = `com.macyolo.selftest-${process.pid}`;
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const opener = path.join(dir, 'opener.sh');
  fs.writeFileSync(opener, '#!/bin/bash\n# would run: open -a "Google Chrome" https://example.com\nexec /bin/sleep 600\n', { mode: 0o755 });
  const loop = path.join(dir, 'loop.sh');
  fs.writeFileSync(loop, '#!/bin/bash\nwhile true; do sleep 1; done\n', { mode: 0o755 });
  fs.writeFileSync(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${opener}</string></array>
<key>StartInterval</key><integer>60</integer><key>RunAtLoad</key><true/></dict></plist>`);
  const uid = process.getuid();
  const child = spawn('/bin/bash', [loop], { detached: true, stdio: 'ignore' });
  child.unref();
  try {
    execFileSync('/bin/launchctl', ['bootstrap', `gui/${uid}`, plistPath]);
    let jobs = call('list').jobs;
    const job = jobs.find((j) => j.id === `launchd:${label}`);
    assert.ok(job, 'test LaunchAgent is listed');
    assert.strictEqual(job.opensApps, true, 'opener is flagged');
    assert.strictEqual(job.schedule, 'every 1 min');
    assert.strictEqual(jobs[0].opensApps, true, 'openers sort first');

    assert.strictEqual(call('pause', `launchd:${label}`).ok, true);
    assert.strictEqual(call('list').jobs.find((j) => j.id === `launchd:${label}`).status, 'paused');
    assert.notStrictEqual(require('child_process').spawnSync('/bin/launchctl', ['print', `gui/${uid}/${label}`]).status, 0, 'paused job is unloaded');

    assert.strictEqual(call('resume', `launchd:${label}`).ok, true);
    assert.notStrictEqual(call('list').jobs.find((j) => j.id === `launchd:${label}`).status, 'paused');

    const loopJob = call('list').jobs.find((j) => j.id === `script:${loop}`);
    assert.ok(loopJob, 'loose loop is listed');
    assert.deepStrictEqual(loopJob.pids, [child.pid]);
    assert.strictEqual(call('stop', `script:${loop}`).ok, true);
    // The loop is this test's own child, so once stopped it lingers as a zombie until reaped.
    const stat = require('child_process').spawnSync('/bin/ps', ['-o', 'stat=', '-p', String(child.pid)], { encoding: 'utf8' }).stdout.trim();
    assert.ok(stat === '' || stat.startsWith('Z'), `loop process is gone (ps stat "${stat}")`);
  } finally {
    require('child_process').spawnSync('/bin/launchctl', ['bootout', `gui/${uid}/${label}`]);
    require('child_process').spawnSync('/bin/launchctl', ['enable', `gui/${uid}/${label}`]);
    fs.rmSync(plistPath, { force: true });
    try { process.kill(child.pid, 'SIGKILL'); } catch { /* stopped */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('mac-yolo-jobs live check ok');
}

console.log('mac-yolo-jobs tests ok');
