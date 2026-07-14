#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const wrapper = path.join(root, 'ali-yolo-wrapper.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ali-yolo-test-'));
const home = path.join(temp, 'home');
const bin = path.join(temp, 'bin');
const capture = path.join(temp, 'args.json');
fs.mkdirSync(path.join(home, '.qwen'), { recursive: true });
fs.mkdirSync(bin, { recursive: true });
const qwen = path.join(bin, 'qwen');
fs.writeFileSync(qwen, `#!/bin/sh
if [ "$1" = "--version" ]; then echo 0.19.10; exit 0; fi
${process.execPath} -e 'require("fs").writeFileSync(process.env.CAPTURE, JSON.stringify(process.argv.slice(1)))' -- "$@"
exit "${'${QWEN_EXIT:-0}'}"
`);
fs.chmodSync(qwen, 0o755);

const settings = {
  modelProviders: { openai: { protocol: 'openai', models: [{ id: 'qwen3.7-plus', baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1', envKey: 'DASHSCOPE_API_KEY' }] } },
  security: { auth: { selectedType: 'openai' } },
  model: { name: 'qwen3.7-plus' },
};
fs.writeFileSync(path.join(home, '.qwen/settings.json'), JSON.stringify(settings));

function run(args, extra = {}) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: bin, CAPTURE: capture, DASHSCOPE_API_KEY: 'test-only', ...extra },
  });
}

let result = run(['--doctor', '--json']);
assert.equal(result.status, 0, result.stderr);
let doctor = JSON.parse(result.stdout);
assert.equal(doctor.ok, true);
assert.equal(doctor.provider, 'Alibaba Cloud');
assert.equal(doctor.fallback, false);
assert.equal(doctor.credentialPresent, true);
assert(!result.stdout.includes('test-only'));

result = run(['-p', 'marker']);
assert.equal(result.status, 0, result.stderr);
assert.deepEqual(JSON.parse(fs.readFileSync(capture)), ['--yolo', '-p', 'marker']);

result = run(['--yolo', '-p', 'marker']);
assert.equal(result.status, 0, result.stderr);
assert.deepEqual(JSON.parse(fs.readFileSync(capture)), ['--yolo', '-p', 'marker']);

result = run(['--approval-mode', 'default']);
assert.equal(result.status, 2);

result = run(['-p', 'marker'], { QWEN_EXIT: '23' });
assert.equal(result.status, 23);

result = run(['--doctor', '--json'], { DASHSCOPE_API_KEY: '' });
assert.equal(result.status, 1);
doctor = JSON.parse(result.stdout);
assert.equal(doctor.credentialPresent, false);

settings.modelProviders.openai.models[0].baseUrl = 'https://api.openai.com/v1';
fs.writeFileSync(path.join(home, '.qwen/settings.json'), JSON.stringify(settings));
result = run(['--doctor', '--json']);
assert.equal(result.status, 1);
assert(JSON.parse(result.stdout).errors.includes('Alibaba ModelStudio route is not configured'));

console.log('ALI_YOLO_TESTS_PASS cases=7 fallback=false');
