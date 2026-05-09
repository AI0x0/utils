/**
 * no-then
 * -------
 * 禁止使用 .then()，强制使用 async/await。
 *
 * 例外（不检测）：
 *   - 文件和 /apis/generator/ 下的代码（已有独立 override）
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止使用 .then()，必须使用 async/await。",
    },
    schema: [],
    messages: {
      noThen: "禁止使用 .then()，请使用 async/await 替代。",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "then"
        ) {
          context.report({
            node: node.callee.property,
            messageId: "noThen",
          });
        }
      },
    };
  },
};

export default rule;
