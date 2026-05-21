/**
 * require-use-form
 * ----------------
 * 约束：前端业务代码中，表单组件禁止用 useState/useSetState 管理字段值。
 * 必须使用 Form.useForm() 或 rc-field-form 的 useForm。
 *
 * 检测方式：
 *   - 文件中出现 JSX 元素且同时包含 value 和 onChange props
 *   - 同时该文件在顶层使用了 useState 或 useSetState
 *   → 报错提示改用 useForm
 *
 * 例外通过文件路径 overrides 处理（utils、hooks、theme 等已豁免）。
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "表单组件必须使用 Form.useForm() 或 rc-field-form useForm 管理状态，禁止用 useState/useSetState 管理字段值。",
    },
    schema: [],
    messages: {
      useFormRequired:
        "检测到表单场景使用了 useState/useSetState 管理字段值。请改用 Form.useForm() 或 rc-field-form 的 useForm。详见 node_modules/@ai0x0/utils/.agents/skills/antd/SKILL.md。",
    },
  },
  create(context) {
    // sourceCode available via context if needed for future enhancement

    // 1. 检测 JSX 元素是否同时包含 value 和 onChange props → 认为是表单组件
    let hasFormPattern = false;

    // 2. 检测是否有 useState / useSetState 调用
    let hasStateHook = false;

    const stateHooks = new Set(["useState", "useSetState"]);

    return {
      JSXOpeningElement(node) {
        if (hasFormPattern) {
          return;
        }

        let hasValue = false;
        let hasOnChange = false;

        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || !attr.name) {
            continue;
          }
          const attrName = attr.name.name;
          if (attrName === "value") {
            hasValue = true;
          } else if (attrName === "onChange") {
            hasOnChange = true;
          }

          if (hasValue && hasOnChange) {
            hasFormPattern = true;
            break;
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && stateHooks.has(callee.name)) {
          hasStateHook = true;
        }
      },
      "Program:exit"() {
        if (hasFormPattern && hasStateHook) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: "useFormRequired",
          });
        }
      },
    };
  },
};

export default rule;
