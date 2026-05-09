/**
 * no-one-letter-vars
 * ------------------
 * 禁止单字母变量名（如 `e`、`i`、`g`、`x` 等），要求使用有意义的命名。
 *
 * 例外：
 *   - `_` 常用于未使用变量
 *   - for 循环的声名部分（for (let i = 0; ...)）— 惯用用法
 *   - 泛型类型参数如 `<T>`
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止使用单字母变量，要求有意义的命名。",
    },
    schema: [],
    messages: {
      noOneLetter: "禁止使用单字母变量名 '{{ name }}'，请使用有意义的名称。",
    },
  },
  create(context) {
    // Track function scopes to know if we're at the top level
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let scopeStack = 0;

    return {
      // --- 变量声名 ---
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== "Identifier") return;
        const name = node.id.name;
        if (name.length !== 1 || !/^[a-z]$/.test(name)) return;

        // Skip `_`
        if (name === "_") return;

        // Skip if inside for loop (for (let i = 0..))
        let parent = node.parent;
        while (parent) {
          if (
            parent.type === "ForStatement" ||
            parent.type === "ForInStatement" ||
            parent.type === "ForOfStatement"
          ) {
            return;
          }
          parent = parent.parent;
        }

        context.report({
          node: node.id,
          messageId: "noOneLetter",
          data: { name },
        });
      },

      // --- 函数/箭头函数参数 ---
      ":function"(node) {
        scopeStack++;
        for (const param of node.params) {
          if (param.type === "Identifier") {
            const name = param.name;
            if (name.length === 1 && /^[a-z]$/.test(name) && name !== "_") {
              context.report({
                node: param,
                messageId: "noOneLetter",
                data: { name },
              });
            }
          } else if (
            param.type === "ObjectPattern" ||
            param.type === "ArrayPattern"
          ) {
            // Check nested patterns
            checkPattern(param, context);
          }
        }
      },
      ":function:exit"() {
        scopeStack--;
      },
    };

    function checkPattern(pattern, ctx) {
      for (const prop of pattern.properties || pattern.elements || []) {
        if (!prop) continue;
        const value =
          prop.type === "RestElement" ? prop.argument : prop.value || prop;
        if (value.type === "Identifier") {
          const name = value.name;
          if (name.length === 1 && /^[a-z]$/.test(name) && name !== "_") {
            ctx.report({
              node: value,
              messageId: "noOneLetter",
              data: { name },
            });
          }
        } else if (
          value.type === "ObjectPattern" ||
          value.type === "ArrayPattern"
        ) {
          checkPattern(value, ctx);
        }
      }
    }
  },
};

export default rule;
