#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const timeoutMs = Number.parseInt(process.env.EXPO_DOCTOR_TIMEOUT_MS ?? '45000', 10);
const allowNpxDownload = process.env.EXPO_DOCTOR_ALLOW_NPX_DOWNLOAD === '1';

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(
    `Invalid EXPO_DOCTOR_TIMEOUT_MS value "${process.env.EXPO_DOCTOR_TIMEOUT_MS ?? ''}". Expected a positive integer.`,
  );
  process.exit(1);
}

function resolveExpoDoctorCommand() {
  try {
    const packageJsonPath = require.resolve('expo-doctor/package.json', {
      paths: [process.cwd()],
    });
    const binPath = path.join(path.dirname(packageJsonPath), 'build', 'index.js');
    return {
      command: process.execPath,
      args: [binPath],
      mode: 'local',
    };
  } catch (error) {
    if (!allowNpxDownload) {
      console.error(
        [
          'Expo Doctor is not installed locally in node_modules.',
          'This environment blocks package download, so `npx expo-doctor` would hang waiting on network/package resolution.',
          'Install `expo-doctor` locally or rerun with EXPO_DOCTOR_ALLOW_NPX_DOWNLOAD=1 in a networked shell.',
        ].join(' '),
      );
      process.exit(1);
    }

    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['expo-doctor'],
      mode: 'npx',
    };
  }
}

const resolvedDoctor = resolveExpoDoctorCommand();

console.log(`Running Expo Doctor with a ${timeoutMs}ms timeout...`);
console.log(`Expo Doctor execution mode: ${resolvedDoctor.mode}`);

const child = spawn(resolvedDoctor.command, resolvedDoctor.args, {
  stdio: 'inherit',
  env: process.env,
});

const timeout = setTimeout(() => {
  console.error(
    `Expo Doctor timed out after ${timeoutMs}ms. This is an explicit blocker for launch proof in the current environment.`,
  );
  child.kill('SIGTERM');

  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 5000).unref();
}, timeoutMs);

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`Failed to start Expo Doctor: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  clearTimeout(timeout);

  if (signal) {
    process.exit(1);
    return;
  }

  process.exit(code ?? 1);
});
