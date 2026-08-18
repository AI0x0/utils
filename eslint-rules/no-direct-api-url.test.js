import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-direct-api-url.js";
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});
const ERROR = {
  message:
    '前端不许手写 "/api/..." 直连后端：走生成的 client。端点先进 openapi.json' +
    "（后端路由走 nrf），重新生成 client 之后调生成出来的方法；401 重登、错误提示、" +
    "作用域头都在那一层集中处理，手写 fetch 全部绕开。",
};
describe("no-direct-api-url", () => {
  it("reports literals and templates starting with /api/", () => {
    ruleTester.run("no-direct-api-url", rule, {
      valid: [
        { code: 'const url = "/api";' },
        { code: 'const url = "https://example.com/api/x";' },
        { code: "const url = `${base}/api/x`;" },
        { code: 'const url = "api/log";' },
        { code: "const url = `/v1/canvas`;" },
        { code: "// 注释里写 /api/x 不报\nconst a = 1;" },
      ],
      invalid: [
        {
          code: 'const url = "/api/paddle/client-config";',
          errors: [ERROR],
        },
        {
          code: 'fetch("/api/log", { method: "POST" });',
          errors: [ERROR],
        },
        {
          code: "const url = `/api/canvas/${id}`;",
          errors: [ERROR],
        },
      ],
    });
  });
});
