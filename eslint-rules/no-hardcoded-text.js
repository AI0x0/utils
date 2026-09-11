// =============================================================================
// 旧账名单之外的文件里，JSX 正文与文案属性不许写裸中文
// =============================================================================
// 国际化迁移要跨好几周，期间新代码还在往里加中文 —— 不拦的话分母是个移动靶，做得再快也
// 追不上。但把整仓库一起开成 error 是不现实的（当场几千个报错，只会被人整条关掉）。
//
// 所以这条规则带一份**只减不增的旧账名单**（由各项目的生成脚本维护，经 options.legacy
// 传入）：名单里的文件一个字都不报，名单外的一条都不许有。**新建的文件天然在名单外**，
// 从第一行起就受管；一个文件迁完了就从名单里划掉，划掉之后它再也回不去。
//
// 名单是「文件还剩多少没迁」的唯一判据，不能拿「这个文件有没有 import i18n 库」代替 ——
// 迁移是分批的（先抽共用词表、再按模块走），一个文件很可能刚接上语言包、里头还剩二十条
// 没动。按 import 判的话，那二十条会在文件刚接上的当天集体变成 error。
//
// 只认两个位置 —— JSX 正文与文案属性。这不是偷懒：正是这两处不会与「中文当值用」相混
//（.describe() 的 API 文档、枚举值、css`` 里的注释都长不到这两个位置上），所以这条规则
// 不需要那一整套语法位置判断，也就不会误报。
//
// **这条规则不进 recommended**（见 index.js 的 SCOPED_RULES）：没做国际化的项目不该被它
// 扫到。要用的项目在自己的 flat config 里按 files 圈定范围、把自己的旧账名单传给
// legacy 选项。

const CJK = /[一-鿿]/;

/** 摆文案的属性名。调用方若有配套的文案扫描脚本，两份名单要保持同源。 */
const TEXT_PROPS = new Set([
  "label",
  "title",
  "placeholder",
  "tooltip",
  "desc",
  "description",
  "okText",
  "cancelText",
  "emptyText",
  "extra",
  "header",
  "footer",
  "alt",
  "tip",
  "subTitle",
  "content",
  "message",
  "hint",
  "heading",
  "caption",
]);

// =============================================================================
// 取值
// =============================================================================

/** 一个节点里的中文文本，没有就返回空串。模板串把静态片段拼起来看。 */
function chineseIn(node) {
  if (!node) {
    return "";
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return CJK.test(node.value) ? node.value : "";
  }
  if (node.type === "TemplateLiteral" && node.quasis) {
    const text = node.quasis.map((part) => part.value.raw).join("${…}");
    return CJK.test(text) ? text : "";
  }
  // JSX 属性里的 `{...}`：真正的值在里头。
  if (node.type === "JSXExpressionContainer") {
    return chineseIn(node.expression);
  }
  return "";
}

/** 属性名。标识符（`label:`、`label=`）读 name，字符串键（`"label":`）读 value。 */
function nameOf(node) {
  if (!node) {
    return "";
  }
  if (typeof node.name === "string") {
    return node.name;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return "";
}

// =============================================================================
// 规则
// =============================================================================

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "旧账名单之外的文件里，JSX 正文与文案属性不许写裸中文。",
    },
    schema: [
      {
        type: "object",
        properties: {
          /** 还没迁完的文件（仓库相对路径），这些文件里一个字都不报。 */
          legacy: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcoded:
        "界面文案要走语言包：把「{{text}}」搬进语言包文件，用 i18n 取值函数读取。这个文件不在旧账豁免名单里。",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    // eslint 给的是绝对路径，名单里存的是仓库相对路径 —— 按后缀比，免得把 cwd 也写进名单
    //（那样名单换台机器就全失效，而失效的样子是「突然多出几千个报错」）。
    const here = context.filename.replaceAll("\\", "/");
    // 测试文件里的中文是**夹具**不是界面文案：被测的输入本身就该是中文。名单是「只减不增」
    // 的，把测试文件塞进去等于把它变成垃圾桶。
    const isTest = /\.test\.tsx?$/.test(here);
    const skipped =
      isTest || (options.legacy ?? []).some((file) => here.endsWith(file));

    const report = (node, text) => {
      if (skipped || !text) {
        return;
      }
      context.report({
        node,
        messageId: "hardcoded",
        data: { text: text.replace(/\s+/g, " ").trim().slice(0, 20) },
      });
    };

    return {
      JSXText(node) {
        const text = node.value ?? "";
        if (CJK.test(text)) {
          report(node, text);
        }
      },
      JSXAttribute(node) {
        if (!TEXT_PROPS.has(nameOf(node.name))) {
          return;
        }
        report(node, chineseIn(node.value));
      },
      Property(node) {
        if (!TEXT_PROPS.has(nameOf(node.key))) {
          return;
        }
        report(node, chineseIn(node.value));
      },
    };
  },
};

export default rule;
