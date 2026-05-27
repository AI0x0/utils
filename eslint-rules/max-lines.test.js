import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./max-lines.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

function createLines(count) {
  return Array.from(
    { length: count },
    (_, index) => `const v${index} = 1;`,
  ).join("\n");
}

describe("max-lines", () => {
  it("reports with a child-file split hint", () => {
    ruleTester.run("max-lines", rule, {
      valid: [
        {
          code: createLines(500),
          options: [{ max: 500 }],
        },
      ],
      invalid: [
        {
          code: createLines(501),
          options: [{ max: 500 }],
          errors: [
            {
              message:
                "单文件代码行数过多（501 行，最多 500 行），请拆分为子文件。",
              line: 501,
            },
          ],
        },
      ],
    });
  });
});
