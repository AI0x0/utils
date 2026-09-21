/**
 * no-accent-border
 * ----------------
 * **悬停 / 聚焦 / 按下的反馈不许描亮边**，走填充底色；也别显式写回带描边的那几个变体。
 *
 * 拦两类：
 *
 *   1. css`` 或 style 对象里，**交互态选择器内**（:hover / :focus / :focus-within /
 *      :focus-visible / :active）把 `border` / `border-color` 设成强调色 token
 *      （colorPrimary* / colorInfo* / colorSuccess* / colorWarning* / colorError*）；
 *   2. JSX 上显式写 `variant="outlined"` / `variant="dashed"` / `type="default"`。
 *
 * **为什么是「交互态」而不是所有亮边**：常态的亮边多半是状态语言 —— 选中的那一格、框选的
 * 那一块、裁剪区、报错块的红框、拖拽的落点。那些是「这一块此刻不一样」的记号，本来就该跳出
 * 版面。而悬停只是「鼠标恰好停在这儿」，给它一圈亮边，一排控件里就总有一个在抢视线。
 *
 * **第 2 类为什么连 `type="default"` 一起拦**：项目一般会用 ConfigProvider 把全站默认变体
 * 设成 filled（antd v6 的 button/input/select 都收 variant）。而显式写 `type="default"`
 * 会走 antd 的 legacy type 映射、解析成 outlined，**把那个全站默认顶掉** —— 写的人以为自己
 * 只是「要一颗普通按钮」，拿到的却是描边的那一档。`variant="outlined"` 同理，只是更直白。
 *
 * **放行**：常态与选中态的任何边框、中性色描边（colorBorder / colorBorderSecondary /
 * colorSplit / colorText*）、`transparent`、`none`，以及交互态里改底色、改阴影、改文字色。
 *
 * **真要在悬停时描亮边**（输入框聚焦、画布里的落点提示这类），就地写一行
 * `eslint-disable-next-line ai0x0/no-accent-border` 并注明为什么。
 */

// ==============================================================================
// 什么算「强调色」
// ==============================================================================
// 按 antd 的色名族判，不看具体色值：这几族是主题里用来「抢眼」的那批，而 colorBorder /
// colorSplit / colorText 那些是结构色。`colorPrimaryBorder` 也在内 —— 它的用途正是描一圈
// 主色边，恰恰是这条规则要拦的东西。
const ACCENT_TOKEN =
  /\b(colorPrimary|colorInfo|colorSuccess|colorWarning|colorError|colorLink|colorHighlight)/;

// 要检查的属性名。只管颜色那一半：border-width / border-radius / border-style 与这条无关。
// 驼峰（style 对象）先拆成连字符再比，两种写法共用这一条。
const BORDER_PROPERTY = /^border(-(top|right|bottom|left))?(-color)?$/;

const isBorderProperty = (name) =>
  BORDER_PROPERTY.test(
    String(name)
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase(),
  );

// ==============================================================================
// css`` 模板：把插值编号后按声明切开
// ==============================================================================
// 模板里 `${token.colorPrimary}` 是一个 AST 表达式、不是文本，所以先把它换成一个编号占位符
// 拼出整段文本，命中某条声明时再顺着编号回去取那个表达式的源码。
// 占位符取私有区字符：CSS 正文里不会出现它，也不是控制字符。
const MARK = "";

function templateText(node) {
  return node.quasi.quasis
    .map((quasi, index) =>
      index < node.quasi.expressions.length
        ? `${quasi.value.raw}${MARK}${String(index)}${MARK}`
        : quasi.value.raw,
    )
    .join("");
}

/** 一段文本里引用到的插值编号。 */
function marksIn(text) {
  return [...text.matchAll(new RegExp(`${MARK}(\\d+)${MARK}`, "gu"))].map(
    (match) => Number(match[1]),
  );
}

// 交互态的伪类。`:focus-within` 与 `:focus-visible` 都算：它们是同一件事的不同精度。
const INTERACTIVE = /:(hover|focus|focus-within|focus-visible|active)\b/;

/**
 * 这条声明落在哪几层选择器里。
 *
 * 扫一遍文本、拿 `{}` 当栈：遇到 `{` 把它前面那段（上一个 `}` 或 `;` 之后的部分）当作选择器
 * 压进去，遇到 `}` 弹出。于是任何位置都能问「我现在在哪几层里」——嵌套写法（`&:hover { … }`
 * 套在别的块里）也答得出来。
 */
function selectorStackAt(text, index) {
  const stack = [];
  let head = 0;
  for (let at = 0; at < index; at += 1) {
    const char = text[at];
    if (char === "{") {
      stack.push(text.slice(head, at));
      head = at + 1;
    } else if (char === "}") {
      stack.pop();
      head = at + 1;
    } else if (char === ";") {
      head = at + 1;
    }
  }
  return stack;
}

function checkCssTemplate(context, node) {
  const text = templateText(node);
  // 逐条声明看：属性名 + 值。嵌套选择器与注释不会被当成声明（它们前面没有 `属性名:`）。
  for (const match of text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/gu)) {
    const [, property, value] = match;
    if (!isBorderProperty(property)) {
      continue;
    }
    // 常态的亮边是状态语言（选中 / 框选 / 报错），放行；只管交互态里的那种。
    if (
      !selectorStackAt(text, match.index).some((one) => INTERACTIVE.test(one))
    ) {
      continue;
    }
    for (const index of marksIn(value)) {
      const expression = node.quasi.expressions[index];
      if (!expression) {
        continue;
      }
      const source = context.sourceCode.getText(expression);
      if (ACCENT_TOKEN.test(source)) {
        // **报在整只模板上，不是那个插值上**：模板内部的 `/* */` 是 CSS 注释、不是 JS 注释节点，
        // 落在里头的报错没法就地 `eslint-disable-next-line`。报在模板这一行，豁免就写在
        // `xxx: css\`` 前面一行 —— 与 no-hardcoded-style 同一个落点（它也这么报）。
        // 代价是同一只模板里的多条违规都指到同一行，所以消息里带上属性名与那个 token。
        context.report({
          node,
          messageId: "accentBorder",
          data: { property: property.trim(), token: source },
        });
      }
    }
  }
}

// ==============================================================================
// style 对象 / createStyles 的对象写法
// ==============================================================================

function checkStyleObject(context, object, interactive = false) {
  for (const prop of object.properties) {
    if (prop.type !== "Property") {
      continue;
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "Literal"
          ? String(prop.key.value)
          : "";
    // 嵌套一层（伪类、子选择器）照样要看，并把「进没进交互态」带下去。
    if (prop.value.type === "ObjectExpression") {
      checkStyleObject(
        context,
        prop.value,
        interactive || INTERACTIVE.test(key),
      );
      continue;
    }
    if (!interactive || !key || !isBorderProperty(key)) {
      continue;
    }
    const source = context.sourceCode.getText(prop.value);
    if (ACCENT_TOKEN.test(source)) {
      context.report({
        node: prop.value,
        messageId: "accentBorder",
        data: { property: key, token: source },
      });
    }
  }
}

// ==============================================================================
// JSX：带描边的那两个变体
// ==============================================================================

function attributeValue(attribute) {
  const value = attribute.value;
  if (!value) {
    return "";
  }
  if (value.type === "Literal") {
    return String(value.value);
  }
  if (
    value.type === "JSXExpressionContainer" &&
    value.expression.type === "Literal"
  ) {
    return String(value.expression.value);
  }
  return "";
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "边框不许用强调色；悬停 / 选中的反馈走填充底色，别用带描边的按钮变体。",
    },
    schema: [],
    messages: {
      accentBorder:
        "悬停 / 聚焦时把 `{{property}}` 描成强调色（{{token}}）。一圈亮边的视觉重量远超它该有的分量，而悬停只是「鼠标恰好停在这儿」—— 反馈改走填充底色（token.colorFill / colorFillSecondary，按钮走 buttonSurface 那类配方）。常态与选中态的亮边不受这条管；输入框聚焦这种确实要描边的，就地 disable 并写明理由。",
      outlinedVariant:
        '显式写 `{{attribute}}="{{value}}"` 会把全站的 filled 默认顶掉，拿到的是描边那一档（`type="default"` 走 antd 的 legacy 映射，解析成 outlined）。要一颗普通按钮就什么都别写；次要按钮写 `color="default" variant="filled"`，要强调的用 `variant="solid"`。确实需要描边的（如浅色行里的输入框）就地 disable 并写明理由。',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : "";
        if (name === "style") {
          const expr = node.value?.expression;
          if (expr?.type === "ObjectExpression") {
            checkStyleObject(context, expr);
          }
          return;
        }
        const value = attributeValue(node);
        const outlined =
          (name === "variant" &&
            (value === "outlined" || value === "dashed")) ||
          (name === "type" && value === "default");
        if (outlined) {
          context.report({
            node,
            messageId: "outlinedVariant",
            data: { attribute: name, value },
          });
        }
      },

      TaggedTemplateExpression(node) {
        if (node.tag.type === "Identifier" && node.tag.name === "css") {
          checkCssTemplate(context, node);
        }
      },
    };
  },
};

export default rule;
