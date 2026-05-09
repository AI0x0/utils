/**
 * no-use-request-run
 * -------------------
 * 禁止在 useRequest 解构中使用 `run`（包括 `run: alias` 和 `run`）。
 * 必须使用 `runAsync` 并配合 `await` 在调用处等待。
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止使用 useRequest 的 run，必须使用 runAsync + await。",
    },
    schema: [],
    messages: {
      useRunAsync:
        "禁止使用 useRequest 的 run/run:xxx，请使用 runAsync/runAsync:xxx + await。",
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === "CallExpression" &&
          node.init.callee.type === "Identifier" &&
          node.init.callee.name === "useRequest"
        ) {
          if (node.id.type === "ObjectPattern") {
            for (const prop of node.id.properties) {
              if (prop.type !== "Property") continue;
              const key = prop.key;
              if (
                key.type === "Identifier" &&
                (key.name === "run" || key.name === "runAsync")
              ) {
                // Only report for `run` / `run: foo`, not for `runAsync`
                if (key.name === "run") {
                  context.report({
                    node: prop,
                    messageId: "useRunAsync",
                  });
                }
              }
            }
          }
        }
      },
    };
  },
};

export default rule;
