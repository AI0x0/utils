/**
 * api-route-via-nrf
 * -----------------
 * API 路由一律走 next-rest-framework（route / routeOperation），不许裸导 HTTP 方法。
 *
 * 裸写 `export async function POST(req)` 的代价不是风格不统一，是这条端点从此不存在于
 * openapi.json：生成器不会给它出 client，CLI / agent 读不到它，前端只能手写 fetch 直连
 * （那是 no-direct-api-url 拦的另一头）。框架统一做的鉴权预热、错误翻译、响应校验，
 * 它也都得自己记得补。
 *
 * 判的是「导出形状」，不是「有没有 import route」：
 * 报：`export async function POST(...)`、`export const GET = handler`；
 * 放：`export const { POST } = route({...})`（从 route() 解构，id 是 ObjectPattern）。
 *
 * 作用范围由调用方在 flat config 里用 files 圈定（比如只在 api 目录的 route.ts 上开）；
 * 确有理由裸导的文件（第三方库的整体转发，如 better-auth 的 catch-all）用 files override
 * 单独关掉，并在那个文件里写明理由。
 */

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "API 路由必须用 next-rest-framework 的 route()/routeOperation() 构建，禁止裸导 HTTP 方法。",
    },
    schema: [],
    messages: {
      rawMethodExport:
        "API 路由不许裸导 HTTP 方法，改用 next-rest-framework 的 route()/routeOperation" +
        "（export const { POST } = route({...})）。裸导的端点进不了 openapi.json，" +
        "前端与 CLI 都拿不到它的 client。",
    },
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (!declaration) {
          return;
        }
        if (
          declaration.type === "FunctionDeclaration" &&
          declaration.id &&
          HTTP_METHODS.has(declaration.id.name)
        ) {
          context.report({
            node: declaration.id,
            messageId: "rawMethodExport",
          });
          return;
        }
        if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            // 从 route() 解构出来的是 ObjectPattern，那才叫走框架。
            if (
              declarator.id.type === "Identifier" &&
              HTTP_METHODS.has(declarator.id.name)
            ) {
              context.report({
                node: declarator.id,
                messageId: "rawMethodExport",
              });
            }
          }
        }
      },
    };
  },
};

export default rule;
