/**
 * no-consecutive-setstate
 * ------------------------
 * 禁止在同一个块中连续调用多个 setState()。
 * ahooks useSetState 的 setState 会合并状态，连续多次调用应该合并为一次。
 *
 * 误：
 *   setState({ a: 1 });
 *   setState({ b: 2 });
 *
 * 正：
 *   setState({ a: 1, b: 2 });
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止连续调用多个 setState()，应合并为一次。",
    },
    schema: [],
    messages: {
      merge:
        "连续多个 setState() 应合并为一次：将 {{prevField}} 和 {{currField}} 合并到一个 setState 中",
    },
  },
  create(context) {
    return {
      BlockStatement(node) {
        const body = node.body;
        for (let i = 0; i + 1 < body.length; i++) {
          const curr = body[i];
          const next = body[i + 1];

          if (
            curr.type !== "ExpressionStatement" ||
            next.type !== "ExpressionStatement"
          )
            continue;

          const currExpr = curr.expression;
          const nextExpr = next.expression;

          const isCurrSetState =
            currExpr.type === "CallExpression" &&
            currExpr.callee.type === "Identifier" &&
            currExpr.callee.name === "setState" &&
            currExpr.arguments.length === 1 &&
            currExpr.arguments[0].type === "ObjectExpression";

          const isNextSetState =
            nextExpr.type === "CallExpression" &&
            nextExpr.callee.type === "Identifier" &&
            nextExpr.callee.name === "setState" &&
            nextExpr.arguments.length === 1 &&
            nextExpr.arguments[0].type === "ObjectExpression";

          if (!isCurrSetState || !isNextSetState) continue;

          const prevField = currExpr.arguments[0];
          const currField = nextExpr.arguments[0];
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const prevFieldText = sourceCode
            .getText(prevField)
            .slice(1, -1)
            .trim();
          const currFieldText = sourceCode
            .getText(currField)
            .slice(1, -1)
            .trim();

          context.report({
            node: next,
            messageId: "merge",
            data: {
              prevField: prevFieldText,
              currField: currFieldText,
            },
          });
        }
      },
    };
  },
};

export default rule;
