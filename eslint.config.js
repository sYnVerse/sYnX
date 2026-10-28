// ESLint flat config (ESLint 9). Replaces the legacy .eslintrc.js.
// The mobile app (mobile/) is checked separately by its own typecheck and expo-doctor.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "public/build/**",
      ".wrangler/**",
      ".cache/**",
      "node_modules/**",
      "graphify-out/**",
      "mobile/**",
      ".artifacts/**",
      "worker-configuration.d.ts",
    ],
  },

  // Base config
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.es2015,
      },
    },
  },

  // Node scripts and config files
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },

  // React
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...react.configs.flat.recommended,
    settings: {
      react: { version: "detect" },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
    },
  },
  { files: ["**/*.{js,jsx,ts,tsx}"], ...react.configs.flat["jsx-runtime"] },
  { files: ["**/*.{js,jsx,ts,tsx}"], ...reactHooks.configs.flat.recommended },
  { files: ["**/*.{js,jsx,ts,tsx}"], ...jsxA11y.flatConfigs.recommended },

  // TypeScript
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      tseslint.configs.recommended,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: { extensions: [".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      // ./build/server only exists after `npm run build`.
      "import/no-unresolved": ["error", { ignore: ["cloudflare:test", "^\\./build/server$"] }],
      // Successor of the old no-empty-interface rule (which was off): allow
      // `interface X extends Y {}` for module augmentation.
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      // Existing code has many `any`s; flag them without failing lint.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Tests use `any` for mocks and fixtures.
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  // Temporarily warnings, not errors: fixing these needs UI or behavior changes
  // (keyboard handlers / roles, label markup, effect refactors), so they are
  // tracked here and should be fixed in follow-up changes, not in a lint migration.
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // React Compiler rules added in eslint-plugin-react-hooks v6+.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // Accessibility rules that need markup changes in existing views.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
    },
  },
);
