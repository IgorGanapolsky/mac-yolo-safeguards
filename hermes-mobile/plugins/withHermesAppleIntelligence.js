/**
 * Expo config plugin — copies App Intents Swift sources on iOS prebuild.
 * @see https://developer.apple.com/apple-intelligence/
 */
const fs = require('fs');
const path = require('path');
const { withInfoPlist, withDangerousMod } = require('@expo/config-plugins');

const SWIFT_SOURCES = fs
  .readdirSync(path.join(__dirname, '..', 'native-intelligence', 'swift'))
  .filter((f) => f.endsWith('.swift'));

function withHermesAppleIntelligence(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSiriUsageDescription =
      mod.modResults.NSSiriUsageDescription ||
      'Hermes uses Siri and Shortcuts to approve or reject risky agent tool calls.';
    mod.modResults.INIntentsSupported = mod.modResults.INIntentsSupported || [];
    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const srcRoot = path.join(projectRoot, 'native-intelligence', 'swift');
      const iosRoot = mod.modRequest.platformProjectRoot;
      const appName = mod.modRequest.projectName || 'HermesMobile';
      const destDir = path.join(iosRoot, appName);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      for (const file of SWIFT_SOURCES) {
        const src = path.join(srcRoot, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
        }
      }

      const readme = path.join(iosRoot, 'HERMES_APP_INTENTS.md');
      fs.writeFileSync(
        readme,
        `# Hermes App Intents\n\nAfter prebuild, add the copied Swift files to the ${appName} Xcode target if they are not auto-linked:\n\n${SWIFT_SOURCES.map((f) => `- ${appName}/${f}`).join('\n')}\n`,
      );
      return mod;
    },
  ]);

  return config;
}

module.exports = withHermesAppleIntelligence;
