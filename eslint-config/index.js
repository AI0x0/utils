/**
 * @ai0x0/utils eslint-config — shared ESLint 9 flat config presets.
 *
 * Usage:
 *
 *   import { ai0x0, allRestrictions, allRestrictionsWithNetworking }
 *     from "@ai0x0/utils/eslint-config/index.js";
 */
import localPlugin from "../eslint-rules/index.js";

export { localPlugin as ai0x0 };

export const allRestrictions = [
  {
    selector: "TryStatement",
    message:
      "禁止 try/catch。后端交给 route-operation 工厂 + defaultOnError 兜底；前端交给 axios 拦截器 + useRequest onError。仅允许 JSON.parse/atob 等入口层解析容错，且必须单行 // eslint-disable-next-line no-restricted-syntax 并注明原因。",
  },
  {
    selector:
      "TSAsExpression:not([typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='const'])",
    message:
      "禁止 `as` 类型断言（`as const` 除外）。优先 satisfies / 类型守卫 / openapi-generator 枚举。必须用 as 时加 // eslint-disable-next-line no-restricted-syntax 注明原因。",
  },
  {
    selector: "CallExpression[callee.name='useState']",
    message:
      "禁止 useState。业务组件请用 ahooks：useRequest / useBoolean / useSetState / useUrlState 等。",
  },
  {
    selector: "CallExpression[callee.name='useEffect']",
    message:
      "禁止 useEffect。副作用请用 ahooks：useMount / useUpdateEffect / useAsyncEffect / useInterval 等。",
  },
  {
    selector: "CallExpression[callee.name='useMemo']",
    message: "禁止 useMemo。React Compiler 会自动记忆化，无需手动优化。",
  },
  {
    selector: "CallExpression[callee.name='useCallback']",
    message: "禁止 useCallback。React Compiler 会自动记忆化，无需手动优化。",
  },
  {
    selector: "JSXOpeningElement[name.name=/^(div|span|p|h[1-6])$/]",
    message:
      "禁用原生 div/span/p/h 标签。布局请用 antd Flex，文本请用 Typography.Text/Paragraph/Title。",
  },
  {
    selector: "Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]",
    message:
      "禁止硬编码颜色字面量。请用 antd token（theme.useToken() 或 createStyles({token}) 里的 colorXxx / colorBgXxx）。",
  },
];

export const allRestrictionsWithNetworking = [
  ...allRestrictions,
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      "禁止在前端业务代码中直接使用 fetch。请使用 axios 封装或 ahooks useRequest。",
  },
  {
    selector: "NewExpression[callee.name='WebSocket']",
    message:
      "禁止在前端业务代码中直接使用 new WebSocket()。请使用项目封装的实时通信层。",
  },
];
