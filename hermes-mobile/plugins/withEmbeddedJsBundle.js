/**
 * Embed the JS bundle in debug APKs so the app launches without Metro.
 * Default RN Gradle skips bundling for debug → black screen when Metro is off.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = 'debuggableVariants = []';

function withEmbeddedJsBundle(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes(MARKER)) {
      return mod;
    }
    if (/\/\/\s*debuggableVariants\s*=\s*\[[^\]]*\]/.test(contents)) {
      contents = contents.replace(/\/\/\s*debuggableVariants\s*=\s*\[[^\]]*\]/, MARKER);
    } else if (/debuggableVariants\s*=\s*\[[^\]]*\]/.test(contents)) {
      contents = contents.replace(/debuggableVariants\s*=\s*\[[^\]]*\]/, MARKER);
    } else {
      contents = contents.replace(
        /react\s*\{/,
        `react {\n    // Hermes Mobile: embed JS in debug APKs (no Metro black screen).\n    ${MARKER}`,
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = withEmbeddedJsBundle;
