#!/usr/bin/env node
/**
 * Developer backdoor: unlock ThumbGate Leash on a connected Android device.
 * Opens hermes://dev/leash-unlock — same as tapping the Leash tab 7× quickly.
 */
const { execFileSync } = require('child_process');

function main() {
  let device = '';
  try {
    device = execFileSync('adb', ['devices'], { encoding: 'utf8' })
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
  // execFileSync with an argv array never invokes a shell, so a device serial
  // containing shell metacharacters (attacker-controlled USB descriptor data)
  // cannot inject commands the way a template-string execSync call would.
  execFileSync(
    'adb',
    ['-s', device, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', deepLink],
    { stdio: 'inherit' },
  );
  console.log(`Opened ${deepLink} on ${device}`);
}

main();
