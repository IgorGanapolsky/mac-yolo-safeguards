#!/usr/bin/env node
/**
 * Developer backdoor: unlock ThumbGate Leash on a connected Android device.
 * Opens hermes://dev/leash-unlock — same as tapping the Leash tab 7× quickly.
 */
const { execSync } = require('child_process');

function main() {
  let device = '';
  try {
    device = execSync('adb devices', { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith('device') && !line.startsWith('List'))
      ?.split('\t')[0];
  } catch {
    device = '';
  }

  if (!device) {
    console.error('No adb device connected.');
    process.exit(1);
  }

  const deepLink = 'hermes://dev/leash-unlock';
  execSync(
    `adb -s ${device} shell am start -a android.intent.action.VIEW -d '${deepLink}'`,
    { stdio: 'inherit' },
  );
  console.log(`Opened ${deepLink} on ${device}`);
}

main();
