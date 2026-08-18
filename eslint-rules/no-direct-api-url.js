/**
 * no-direct-api-url
 * -----------------
 * 前端不许手写 "/api/..." 地址直连后端，一律走生成的 client。
 *
 * 手写 `fetch("/api/xxx")` 绕掉的不是一层方便，是一整套集中处理（401 重登、错误提示、
 * 作用域头、重复请求去重），而且 TypeScript 对它是瞎的 —— 路由改了形状，编译不红。
 * 所以要调一个端点：先让它进 openapi.json（后端路由走 nrf，见 api-route-via-nrf），
 * 重新生成 client，再调生成出来的方法。
 *
 * 判的是字符串字面量与模板串的开头：`/api/`。注释与 JSDoc 不是 AST 节点，天然不报。
 * 作用范围由调用方在 flat config 里用 files 圈定（比如只挂前端目录），client 封装层
 * 自己（生成文件与拦截器）用 files override 关掉 —— 地址本来就该只写在那儿。
 */

const API_PREFIX = "/api/";

function startsWithApi(value) {
  return typeof value === "string" && value.startsWith(API_PREFIX);
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        '前端禁止手写 "/api/..." 地址直连后端，必须走生成的 client。',
    },
    schema: [],
    messages: {
      directApiUrl:
        '前端不许手写 "/api/..." 直连后端：走生成的 client。端点先进 openapi.json' +
        "（后端路由走 nrf），重新生成 client 之后调生成出来的方法；401 重登、错误提示、" +
        "作用域头都在那一层集中处理，手写 fetch 全部绕开。",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (startsWithApi(node.value)) {
          context.report({ node, messageId: "directApiUrl" });
        }
      },
      TemplateLiteral(node) {
        // 只看第一段静态文本：`${base}/api/x` 的地址不归这条管（那是封装层的拼法）。
        if (startsWithApi(node.quasis[0]?.value.cooked)) {
          context.report({ node, messageId: "directApiUrl" });
        }
      },
    };
  },
};

export default rule;
