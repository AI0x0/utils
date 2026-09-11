import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "./no-hardcoded-text.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("no-hardcoded-text", () => {
  it("reports hardcoded CJK text outside the legacy list", () => {
    ruleTester.run("no-hardcoded-text", rule, {
      valid: [
        // 英文不受管
        { code: 'const App = () => <div title="Hello">Hi</div>;' },
        // 旧账名单里的文件一个字都不报（按后缀比）
        {
          code: 'const App = () => <div title="标题">正文</div>;',
          filename: "/repo/packages/web/legacy-view.tsx",
          options: [{ legacy: ["packages/web/legacy-view.tsx"] }],
        },
        // 测试文件里的中文是夹具
        {
          code: 'it("x", () => { voiceOf("二十八岁的女人"); });',
          filename: "/repo/src/foo.test.ts",
        },
        // 中文当值用：不在 JSX 正文 / 文案属性这两个位置
        { code: 'const Enum = { NARRATOR: "旁白" };' },
        { code: 'api.describe("用户头像");' },
        // 非文案属性不受管
        { code: 'const App = () => <img src="图片.png" data-x="注" />;' },
      ],
      invalid: [
        // JSX 正文
        {
          code: "const App = () => <div>你好世界</div>;",
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
        // JSX 文案属性（字面量与表达式容器）
        {
          code: 'const App = () => <Input placeholder="请输入" />;',
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
        {
          code: 'const App = () => <Modal title={"确认删除"} />;',
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
        // 对象字面量里的文案属性
        {
          code: 'const column = { title: "名称", dataIndex: "name" };',
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
        // 字符串键的文案属性
        {
          code: 'const column = { "title": "名称" };',
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
        // 模板串
        {
          code: "const App = () => <div label={`共${n}条记录`} />;",
          filename: "/repo/src/app.tsx",
          errors: [{ messageId: "hardcoded" }],
        },
      ],
    });
  });
});
