// ESLint flat config for the mobile app, using Expo's standard setup
// (eslint-config-expo, which includes the React and React Hooks rules):
// https://docs.expo.dev/guides/using-eslint/
// Run with `npm run lint` (which calls `expo lint`).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      ".expo/**",
      "android/**",
      "ios/**",
      // Copied from the root shared/ folder by scripts/sync-shared.js and
      // linted there by the root config, so it is not linted twice here.
      "src/shared/**",
    ],
  },

  // Node scripts and config files (build hooks, app config). These run in
  // Node, not in the app bundle, so Node globals apply and reading
  // process.env directly is fine.
  {
    files: ["scripts/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "expo/no-env-var-destructuring": "off" },
  },

  // TypeScript already checks these, and they report false positives on
  // TypeScript enums and re-exports (same as the root config).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "import/named": "off",
      "import/namespace": "off",
      "import/default": "off",
      "import/no-named-as-default-member": "off",
    },
  },
]);
