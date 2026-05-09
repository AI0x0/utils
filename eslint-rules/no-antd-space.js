/**
 * no-antd-space
 * -------------
 * 禁止使用 antd <Space>，用 antd <Flex> 代替。
 *
 * 映射参考：
 * - <Space direction="vertical"> → <Flex vertical>
 * - <Space size={N}> → <Flex gap={N}>
 * - <Space wrap> → <Flex wrap="wrap">
 * - Space.Compact → 用 Flex 自行实现紧凑排列
 *
 * 本规则只负责检测，不负责自动修复。
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "禁止使用 antd <Space>，请使用 antd <Flex> 代替。",
    },
    schema: [],
    messages: {
      useFlexInstead:
        "禁止使用 antd <Space>，请使用 antd <Flex> 代替。<Space> 的 props 到 <Flex> 的映射：direction={vertical} → vertical, wrap → wrap='wrap', size={N} → gap={N}。",
      useFlexInsteadCompact:
        "禁止使用 antd <Space.Compact>，请使用 <Flex> 自行实现紧凑排列。",
    },
  },
  create(context) {
    const getTagName = (name) => {
      if (name.type === "JSXIdentifier") return name.name;
      if (
        name.type === "JSXMemberExpression" &&
        name.object.type === "JSXIdentifier" &&
        name.property.type === "JSXIdentifier"
      ) {
        return `${name.object.name}.${name.property.name}`;
      }
      return "";
    };

    return {
      JSXOpeningElement(node) {
        const tagName = getTagName(node.name);
        if (tagName === "Space") {
          context.report({
            node: node,
            messageId: "useFlexInstead",
          });
        }
        if (tagName === "Space.Compact") {
          context.report({
            node: node,
            messageId: "useFlexInsteadCompact",
          });
        }
      },
    };
  },
};

export default rule;
