// ESLint flat config (ESLint 9). Replaces the legacy .eslintrc.js.
// The mobile app (mobile/) has its own Expo ESLint config (mobile/eslint.config.js),
// run by `npm run lint` in mobile/ and the "Mobile lint" CI job.
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
      // TypeScript already checks these, and import/namespace builds export maps
      // of every imported module (including React Native via the mobile tests),
      // which ran CI out of memory. typescript-eslint recommends turning them off:
      // https://typescript-eslint.io/troubleshooting/typed-linting/performance#eslint-plugin-import
      "import/named": "off",
      "import/namespace": "off",
      "import/default": "off",
      "import/no-named-as-default-member": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Tests use `any` for mocks and fixtures.
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/purity": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "error",
    },
  },
);
