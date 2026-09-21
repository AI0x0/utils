import { RuleTester } from "eslint";
import { describe } from "vitest";

import rule from "./no-accent-border.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
    sourceType: "module",
  },
});

// =============================================================================
// ⚠️ ruleTester.run 必须直接写在 describe 里，**不能套在 it 里**
// =============================================================================
// ESLint 9 的 RuleTester 会拿全局的 describe / it 把每条用例注册成一个测试。套在 it 里调用
// 就是「在一个已经跑起来的测试里注册新测试」——vitest 不会执行它们，于是整份测试恒绿：
// 2026-09-21 我把四条本该失败的用例写进 invalid，`vitest run` 照样报 2 passed。
// 直接写在 describe 里，每条用例才真的是一个测试（这一份跑出来是十几个，不是两个）。
describe("no-accent-border", () => {
  ruleTester.run("no-accent-border", rule, {
    invalid: [
      // 悬停把边框染成主色 —— 这条规则的主要目标。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            tile: css\`
              border: \${token.lineWidth}px solid \${token.colorBorder};
              &:hover {
                border-color: \${token.colorPrimary};
              }
            \`,
          }));
        `,
        errors: [{ messageId: "accentBorder" }],
      },
      // 聚焦态同理，colorPrimaryBorder 这一族就是拿来描主色边的。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            box: css\`
              &:focus-within {
                border-color: \${token.colorPrimaryBorderHover};
              }
            \`,
          }));
        `,
        errors: [{ messageId: "accentBorder" }],
      },
      // 嵌套在别的块里的交互态也要认出来（栈往上找，不是只看最里层）。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            list: css\`
              & .row {
                &:hover {
                  border-left-color: \${token.colorError};
                }
              }
            \`,
          }));
        `,
        errors: [{ messageId: "accentBorder" }],
      },
      // style 对象里的伪类嵌套。
      {
        code: `const node = <div style={{ "&:hover": { borderColor: token.colorWarning } }} />;`,
        errors: [{ messageId: "accentBorder" }],
      },
      // 显式写回带描边的变体：它会把全站的 filled 默认顶掉。
      {
        code: `const node = <Button variant="outlined" />;`,
        errors: [{ messageId: "outlinedVariant" }],
      },
      {
        code: `const node = <Button variant="dashed" />;`,
        errors: [{ messageId: "outlinedVariant" }],
      },
      {
        code: `const node = <Button type="default" />;`,
        errors: [{ messageId: "outlinedVariant" }],
      },
    ],
    valid: [
      // ---------------------------------------------------------------------
      // 常态与选中态的亮边是**状态语言**，不归这条管
      // ---------------------------------------------------------------------
      // 选中的那一格、框选、裁剪区、报错块的红框、拖拽落点 —— 它们本来就该跳出版面。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            picked: css\`
              border: \${token.lineWidth}px solid \${token.colorInfo};
            \`,
          }));
        `,
      },
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            failed: css\`
              border-color: \${token.colorError};
            \`,
          }));
        `,
      },
      {
        code: `const node = <div style={{ borderColor: token.colorWarning }} />;`,
      },
      // ---------------------------------------------------------------------
      // 交互态里改别的东西，正是这条规则想要的写法
      // ---------------------------------------------------------------------
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            row: css\`
              &:hover {
                background: \${token.colorFillTertiary};
                color: \${token.colorText};
                box-shadow: \${token.boxShadowSecondary};
              }
            \`,
          }));
        `,
      },
      // 交互态里的中性描边照样放行。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            card: css\`
              &:hover {
                border-color: \${token.colorBorderSecondary};
              }
              &:active {
                border-color: transparent;
              }
            \`,
          }));
        `,
      },
      // 强调色用在别的属性上不管。
      {
        code: `
          const styles = createStyles(({ css, token }) => ({
            tip: css\`
              &:hover {
                color: \${token.colorPrimary};
                background: \${token.colorInfoBg};
                box-shadow: 0 0 0 1px \${token.colorPrimaryBorder};
              }
            \`,
          }));
        `,
      },
      // 推荐的按钮写法。
      { code: `const node = <Button color="default" variant="filled" />;` },
      { code: `const node = <Button type="primary" />;` },
      { code: `const node = <Button type="text" />;` },
      { code: `const node = <Button />;` },
    ],
  });
});
