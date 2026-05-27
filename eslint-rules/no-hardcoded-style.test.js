import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./no-hardcoded-style.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("no-hardcoded-style", () => {
  it("checks css template literals without duplicate createStyles reports", () => {
    ruleTester.run("no-hardcoded-style", rule, {
      valid: [
        {
          code: `
            const styles = createStyles(({ css, token }) => ({
              card: css\`
                padding: \${token.paddingXS}px \${token.paddingSM}px;
                border: \${token.lineWidth}px solid \${token.colorBorder};
                border-radius: \${token.borderRadiusLG}px;
                box-shadow: \${token.boxShadow};
                background: \${token.colorBgContainer};
                color: \${token.colorText};
              \`,
            }));
          `,
        },
      ],
      invalid: [
        {
          code: `
            const styles = createStyles(({ css, token }) => ({
              card: css\`
                padding: \${token.paddingXS}px 12px;
                border-radius: 14px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
                background: \${token.colorBgContainer} #fff;
                color: #ffdd00;
                border: 1px solid \${token.colorBorder};
              \`,
            }));
          `,
          errors: [
            { messageId: "noHardcoded" },
            { messageId: "noHardcoded" },
            { messageId: "noHardcoded" },
            { messageId: "noHardcoded" },
            { messageId: "noHardcoded" },
            { messageId: "noHardcoded" },
          ],
        },
      ],
    });
  });
});
