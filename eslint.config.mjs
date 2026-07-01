import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  js.configs.recommended,
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "pnpm-lock.yaml"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false
      },
      globals: {
        Buffer: "readonly",
        console: "readonly",
        crypto: "readonly",
        globalThis: "readonly",
        process: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        fetch: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-unused-vars": "off",
      "no-console": ["warn", { "allow": ["warn", "error"] }]
    }
  }
];
