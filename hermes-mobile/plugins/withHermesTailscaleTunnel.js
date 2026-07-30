/**
 * Expo config plugin — always-on Android Tailscale tunnel signals for false-off fix.
 * Copies Kotlin sources into the prebuild android tree and registers the package
 * on free (`…hermesmobile`) and paid (`…hermesmobile.paid`) MainApplication paths.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const MAIN_APP_RELATIVE_CANDIDATES = [
  path.join('app', 'src', 'main', 'java', 'com', 'iganapolsky', 'hermesmobile', 'MainApplication.kt'),
  path.join(
    'app',
    'src',
    'main',
    'java',
    'com',
    'iganapolsky',
    'hermesmobile',
    'paid',
    'MainApplication.kt',
  ),
];

function registerPackageInMainApplication(mainAppPath) {
  if (!fs.existsSync(mainAppPath)) {
    return false;
  }
  let mainApp = fs.readFileSync(mainAppPath, 'utf8');
  if (mainApp.includes('HermesTailscaleTunnelPackage')) {
    return true;
  }
  if (!/PackageList\(this\)\.packages\.apply\s*\{/.test(mainApp)) {
    return false;
  }
  mainApp = mainApp.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{)/,
    `$1
          add(com.iganapolsky.hermesmobile.tunnel.HermesTailscaleTunnelPackage())`,
  );
  fs.writeFileSync(mainAppPath, mainApp);
  return true;
}

function withHermesTailscaleTunnelSources(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const srcRoot = path.join(projectRoot, 'native-tailscale-tunnel', 'kotlin');
      const pkgDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'iganapolsky',
        'hermesmobile',
        'tunnel',
      );
      if (!fs.existsSync(srcRoot)) {
        return mod;
      }
      fs.mkdirSync(pkgDir, { recursive: true });
      for (const file of fs.readdirSync(srcRoot)) {
        if (file.endsWith('.kt')) {
          fs.copyFileSync(path.join(srcRoot, file), path.join(pkgDir, file));
        }
      }
      for (const rel of MAIN_APP_RELATIVE_CANDIDATES) {
        registerPackageInMainApplication(
          path.join(mod.modRequest.platformProjectRoot, rel),
        );
      }
      // Also register any MainApplication.kt under hermesmobile (future flavor paths).
      const javaRoot = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'iganapolsky',
        'hermesmobile',
      );
      if (fs.existsSync(javaRoot)) {
        const walk = (dir) => {
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              walk(full);
            } else if (ent.name === 'MainApplication.kt') {
              registerPackageInMainApplication(full);
            }
          }
        };
        walk(javaRoot);
      }
      const proguardPath = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      if (fs.existsSync(proguardPath)) {
        let rules = fs.readFileSync(proguardPath, 'utf8');
        if (!rules.includes('hermesmobile.tunnel')) {
          rules +=
            '\n# Hermes Tailscale tunnel native bridge\n' +
            '-keep class com.iganapolsky.hermesmobile.tunnel.** { *; }\n' +
            '-keepclassmembers class com.iganapolsky.hermesmobile.tunnel.** { *; }\n';
          fs.writeFileSync(proguardPath, rules);
        }
      }
      return mod;
    },
  ]);
}

function withHermesTailscaleTunnel(config) {
  return withHermesTailscaleTunnelSources(config);
}

module.exports = withHermesTailscaleTunnel;
