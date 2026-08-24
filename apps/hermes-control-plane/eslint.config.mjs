import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // eslint-config-next ships `settings.react.version = "detect"`. Under
    // ESLint 10 that crashes the whole run before a single file is reported:
    //
    //   TypeError: Error while loading rule 'react/display-name':
    //   contextOrFilename.getFilename is not a function
    //
    // Detection is the only caller of eslint-plugin-react's resolveBasedir(),
    // which still calls the context.getFilename() that ESLint 10 removed.
    // Pinning an explicit version skips detection entirely, so this is a
    // config-only fix with no dependency or lockfile churn. Keep it in step
    // with the react dependency in package.json.
    settings: { react: { version: "19.2" } },
  },
]);

export default eslintConfig;
