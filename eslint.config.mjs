import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  { 
    files: ["**/*.{js,mjs,cjs}"], 
    plugins: { js }, 
    extends: ["js/recommended"], 
    languageOptions: { 
      globals: {...globals.browser, ...globals.node},
      ecmaVersion: 2022
    },
    rules: {
      // Allow empty catch blocks for best-effort error handling
      "no-empty": ["error", { "allowEmptyCatch": true }],
      // Disable unused variable warnings for catch parameters (common pattern for ignored errors)
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }]
    }
  },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm", extends: ["markdown/recommended"] },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);
