// ==============================================================================
// 白名单
// ==============================================================================

const ALLOWED_LITERALS = new Set([
  "auto",
  "none",
  "hidden",
  "visible",
  "transparent",
  "inherit",
  "pre-wrap",
  "pre",
  "normal",
  "pointer",
  "default",
  "move",
  "not-allowed",
  "grab",
  "grabbing",
  "center",
  "flex-start",
  "flex-end",
  "space-between",
  "space-around",
  "left",
  "right",
  "top",
  "bottom",
  "start",
  "end",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
  "block",
  "inline-block",
  "inline",
  "flex",
  "grid",
  "contents",
  "row",
  "column",
  "row-reverse",
  "column-reverse",
  "wrap",
  "nowrap",
  "wrap-reverse",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "static",
  "bold",
  "bolder",
  "lighter",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "italic",
  "oblique",
  "uppercase",
  "lowercase",
  "capitalize",
  "underline",
  "overline",
  "line-through",
  "blink",
  "collapse",
  "separate",
  "border-box",
  "content-box",
  "padding-box",
  "contain",
  "cover",
  "fill",
  "scale-down",
]);

const TOKEN_KEYS = new Set([
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginInline",
  "marginInlineStart",
  "marginInlineEnd",
  "marginBlock",
  "marginBlockStart",
  "marginBlockEnd",
  "padding",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingInline",
  "paddingInlineStart",
  "paddingInlineEnd",
  "paddingBlock",
  "paddingBlockStart",
  "paddingBlockEnd",
  "gap",
  "rowGap",
  "columnGap",
  "color",
  "background",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "outlineColor",
  "border",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "borderWidth",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderStyle",
  "borderTopStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderRightStyle",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "boxShadow",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "top",
  "bottom",
  "left",
  "right",
]);

// ==============================================================================
// Token 属性 / 检查逻辑
// ==============================================================================

/** kebab-case → camelCase 映射（用于 css`` 模板字符串） */
const KEBAB_TO_CAMEL = {};
for (const key of TOKEN_KEYS) {
  const kebab = key.replace(/([A-Z])/g, "-$1").toLowerCase();
  KEBAB_TO_CAMEL[kebab] = key;
}

function isTokenExpr(node) {
  if (!node) {
    return false;
  }
  if (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === "token"
  ) {
    return true;
  }
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    ["token", "calc", "max", "min", "clamp"].includes(node.callee.name)
  ) {
    return true;
  }
  return false;
}

function containsTokenExpr(node) {
  if (!node) {
    return false;
  }
  if (isTokenExpr(node)) {
    return true;
  }
  switch (node.type) {
    case "BinaryExpression":
    case "LogicalExpression":
      return containsTokenExpr(node.left) || containsTokenExpr(node.right);
    case "UnaryExpression":
      return containsTokenExpr(node.argument);
    case "ConditionalExpression":
      return [node.test, node.consequent, node.alternate].some((child) =>
        containsTokenExpr(child),
      );
    case "CallExpression":
      return [node.callee, ...node.arguments].some((child) =>
        containsTokenExpr(child),
      );
    case "TemplateLiteral":
      return node.expressions.some((expr) => containsTokenExpr(expr));
    case "MemberExpression":
      return containsTokenExpr(node.object) || containsTokenExpr(node.property);
    default:
      return false;
  }
}

const CSS_GLUE_KEYWORDS =
  /\b(auto|none|hidden|visible|transparent|inherit|currentColor|important|calc|min|max|clamp|var|pre-wrap|pre|normal|pointer|default|move|not-allowed|grab|grabbing|center|flex-start|flex-end|space-between|space-around|left|right|top|bottom|start|end|solid|dashed|dotted|double|groove|ridge|inset|outset|block|inline-block|inline|flex|grid|contents|row|column|row-reverse|column-reverse|wrap|nowrap|wrap-reverse|relative|absolute|fixed|sticky|static|bold|bolder|lighter|italic|oblique|uppercase|lowercase|capitalize|underline|overline|line-through|blink|collapse|separate|border-box|content-box|padding-box|contain|cover|fill|scale-down)\b/g;

function isAllowedValue(node) {
  if (!node) {
    return true;
  }
  if (isTokenExpr(node)) {
    return true;
  }
  if (node.type === "Literal" && (node.value === 0 || node.value === "0")) {
    return true;
  }
  if (
    node.type === "Literal" &&
    typeof node.value === "string" &&
    ALLOWED_LITERALS.has(node.value)
  ) {
    return true;
  }
  if (
    node.type === "Literal" &&
    typeof node.value === "string" &&
    /^(\d+(\.\d+)?(px|em|rem|%|vh|vw|vmin|vmax|ex|ch|cm|mm|in|pt|pc)|\d+(\.\d+)?\s+(px|em|rem)\s+(solid|dashed|dotted)|\d+\.?\d*%)$/.test(
      node.value,
    )
  ) {
    return true;
  }
  if (
    [
      "ConditionalExpression",
      "LogicalExpression",
      "BinaryExpression",
      "UnaryExpression",
      "TemplateLiteral",
      "CallExpression",
      "Identifier",
      "MemberExpression",
      "SpreadElement",
    ].includes(node.type)
  ) {
    return true;
  }
  if (node.type === "ObjectExpression" || node.type === "ArrayExpression") {
    return true;
  }
  return false;
}

function normalizeCssValue(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllowedCssLiteralValue(value) {
  const normalized = normalizeCssValue(value);
  if (!normalized) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "0px" ||
    ALLOWED_LITERALS.has(normalized)
  ) {
    return true;
  }
  if (
    /^\d+\.?\d*%$/.test(normalized) ||
    /^100(vh|vw)$/.test(normalized) ||
    normalized === "1"
  ) {
    return true;
  }
  return false;
}

function stripAllowedExpressionGlue(value) {
  return value
    .replace(/\$\{EXPR_\d+\}/g, " ")
    .replace(/\b100(vh|vw)\b/g, " ")
    .replace(/\b(px|em|rem|%|vh|vw|vmin|vmax|ex|ch|cm|mm|in|pt|pc)\b/g, " ")
    .replace(CSS_GLUE_KEYWORDS, " ")
    .replace(/\b0\b/g, " ")
    .replace(/\b100\b/g, " ")
    .replace(/[(),/+\-%!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHardcodedCssLiteral(value) {
  const normalized = normalizeCssValue(value);
  if (isAllowedCssLiteralValue(normalized)) {
    return false;
  }
  if (/#[0-9a-fA-F]{3,8}\b/.test(normalized)) {
    return true;
  }
  if (
    /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|linear-gradient|radial-gradient)\(/i.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/\b-?\d*\.?\d+\b/.test(stripAllowedExpressionGlue(normalized))) {
    return true;
  }
  return stripAllowedExpressionGlue(normalized).length > 0;
}

function checkStyleObject(context, objExpr) {
  for (const prop of objExpr.properties) {
    if (prop.type !== "Property") {
      continue;
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "Literal"
          ? prop.key.value
          : null;
    if (!key || !TOKEN_KEYS.has(key)) {
      continue;
    }
    const val = prop.value;
    if (isAllowedValue(val)) {
      continue;
    }
    const valText = context.getSourceCode().getText(val);
    context.report({
      node: prop,
      messageId: "noHardcoded",
      data: { key, value: valText },
    });
  }
}

function checkCssTemplate(context, node) {
  const template = node.quasi;
  const quasis = template.quasis;
  const expressions = template.expressions;

  // 构建完整 CSS 文本，用占位符标记插值位置
  let fullText = "";
  for (let i = 0; i < quasis.length; i++) {
    fullText += quasis[i].value.raw;
    if (i < expressions.length) {
      fullText += `\${EXPR_${i}}`;
    }
  }

  // 按行分割，逐行检查
  const lines = fullText.split(/\n/);
  for (const line of lines) {
    // 简单解析：找冒号分割的 property: value
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }

    const rawProp = line.slice(0, colonIdx).trim();
    const rawVal = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/;$/, "")
      .trim();

    // 忽略 css 嵌套规则、@media 等
    if (
      rawProp.startsWith("&") ||
      rawProp.startsWith("@") ||
      rawProp.startsWith("//")
    ) {
      continue;
    }

    // 匹配 camelCase 或 kebab-case 属性
    const camelProp = TOKEN_KEYS.has(rawProp)
      ? rawProp
      : KEBAB_TO_CAMEL[rawProp];
    if (!camelProp) {
      continue;
    }

    const expressionIndexes = [...rawVal.matchAll(/\$\{EXPR_(\d+)\}/g)].map(
      (match) => Number(match[1]),
    );

    // 完全由非 token 变量 / 函数提供的值无法静态判断，保持兼容。
    if (
      expressionIndexes.length > 0 &&
      expressionIndexes.every(
        (index) => !containsTokenExpr(expressions[index]),
      ) &&
      !hasHardcodedCssLiteral(rawVal)
    ) {
      continue;
    }

    if (!hasHardcodedCssLiteral(rawVal)) {
      continue;
    }

    context.report({
      node: template,
      messageId: "noHardcoded",
      data: { key: rawProp, value: rawVal },
    });
  }
}

// ==============================================================================
// ESLint 规则
// ==============================================================================

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "禁止在 style / createStyles / css`` 中硬编码样式值，强制使用 antd token。",
    },
    schema: [],
    messages: {
      noHardcoded:
        "禁止硬编码 `{{ {{key}}: {{value}} }}`。请使用 antd token（如 `token.marginSM`、`token.colorPrimary`）。可参考 node_modules/@ai0x0/utils/.agents/skills/antd/SKILL.md 了解 token 体系。",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== "style") {
          return;
        }
        const expr = node.value?.expression;
        if (!expr || expr.type !== "ObjectExpression") {
          return;
        }
        checkStyleObject(context, expr);
      },

      TaggedTemplateExpression(node) {
        if (node.tag.type === "Identifier" && node.tag.name === "css") {
          checkCssTemplate(context, node);
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "createStyles"
        ) {
          return;
        }
        const arg = node.arguments[0];
        if (!arg) {
          return;
        }

        if (arg.type === "ObjectExpression") {
          for (const prop of arg.properties) {
            if (prop.type !== "Property") {
              continue;
            }
            if (prop.value.type === "ObjectExpression") {
              checkStyleObject(context, prop.value);
            }
          }
          return;
        }

        let body = null;
        if (arg.type === "ArrowFunctionExpression") {
          body = arg.body;
        } else if (arg.type === "FunctionExpression") {
          body = arg.body;
        }
        if (!body) {
          return;
        }

        if (body.type === "ObjectExpression") {
          for (const prop of body.properties) {
            if (prop.type !== "Property") {
              continue;
            }
            if (prop.value.type === "ObjectExpression") {
              checkStyleObject(context, prop.value);
            }
          }
          return;
        }

        if (body.type === "BlockStatement") {
          for (const stmt of body.body) {
            if (
              stmt.type === "ReturnStatement" &&
              stmt.argument?.type === "ObjectExpression"
            ) {
              for (const prop of stmt.argument.properties) {
                if (prop.type !== "Property") {
                  continue;
                }
                if (prop.value.type === "ObjectExpression") {
                  checkStyleObject(context, prop.value);
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
