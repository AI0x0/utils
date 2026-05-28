import { ai0x0 } from "./eslint-config/index.js";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import nextConfig from "eslint-config-next/core-web-vitals";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  {
    ignores: ["**/dist/**", "**/es/**", "**/lib/**", "**/.dumi/**"],
  },
  ai0x0.configs.recommended,
  ...nextConfig,
  ...compat.config({
    extends: ["prettier", "eslint:recommended"],
    parser: "@typescript-eslint/parser",
    plugins: ["eslint-plugin-prettier"],
    rules: {
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      "@typescript-eslint/no-explicit-any": 0,
      curly: "error",
    },
  }),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
