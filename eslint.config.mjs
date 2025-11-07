import js from "@eslint/js";
import globals from "globals";

const baseConfig = js.configs.recommended;
const baseLanguageOptions = baseConfig.languageOptions ?? {};

export default [
  {
    ignores: ["node_modules/", "data/", "coverage/", "dist/", "resources/"],
  },
  {
    ...baseConfig,
    files: ["**/*.js"],
    languageOptions: {
      ...baseLanguageOptions,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...baseLanguageOptions.globals,
        ...globals.node,
      },
    },
    rules: {
      ...baseConfig.rules,
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ...baseLanguageOptions,
      globals: {
        ...baseLanguageOptions.globals,
        ...globals.node,
        ...globals.browser,
        ...globals.jest,
      },
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ...baseLanguageOptions,
      globals: {
        ...baseLanguageOptions.globals,
        ...globals.browser,
      },
    },
  },
];
