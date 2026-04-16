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
  ...nextConfig,
  ...compat.config({
    extends: [
      "prettier",
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    plugins: ["eslint-plugin-prettier", "@typescript-eslint"],
    rules: {
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
      "@typescript-eslint/no-explicit-any": 0,
    },
  }),
];

export default eslintConfig;
