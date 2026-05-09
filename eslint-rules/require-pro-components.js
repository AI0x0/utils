/**
 * require-pro-components
 * ----------------------
 * 约束前端业务代码：
 * 1. 禁止直接使用 antd <Modal>，必须用 @ant-design/pro-components 的 <ModalForm>
 * 2. 禁止直接使用 <Form.Item>，必须用 @ant-design/pro-components 的 ProForm* 组件
 * 3. ProForm* 组件必须设置 rules 进行校验，否则需要 eslint-disable 注明原因
 *
 * 例外场景：
 * - noStyle 的 Form.Item（仅作布局容器）
 * - ProForm 容器本身（不是字段组件）
 * - ProFormDependency、ProFormFieldSet、ProFormList 等非字段组件
 */

const PROFORM_CONTAINER_COMPONENTS = new Set([
  "ProForm",
  "ProFormDependency",
  "ProFormFieldSet",
  "ProFormList",
  "ProFormGrid",
  "ProFormGroup",
]);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "禁止直接使用 antd <Modal>（用 ModalForm 代替），禁止直接使用 <Form.Item>（用 ProForm* 代替），ProForm* 必须设置 rules",
    },
    schema: [],
    messages: {
      useModalForm:
        "禁止直接使用 antd <Modal>，请使用 @ant-design/pro-components 的 <ModalForm> 代替。",
      useProFormItem:
        "禁止直接使用 <Form.Item>，请使用 @ant-design/pro-components 的 ProFormText / ProFormSelect / ProFormItem 等组件代替。",
      needProFormRules:
        "<{{tag}}> 必须设置 rules 进行校验。如果确实不需要校验，请用 // eslint-disable-next-line 注明原因。",
      noSubmitHtmlType:
        '禁止使用 <Button htmlType="submit">，请使用 ProForm 的 submitter 属性提交表单。',
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

        // <Modal>
        if (tagName === "Modal") {
          context.report({
            node: node,
            messageId: "useModalForm",
          });
        }

        // <Form.Item>
        if (tagName === "Form.Item") {
          let isNoStyle = false;
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (attr.name.name === "noStyle") {
              isNoStyle = true;
              break;
            }
          }
          if (!isNoStyle) {
            context.report({
              node: node,
              messageId: "useProFormItem",
            });
          }
        }

        // <Button htmlType="submit">
        if (tagName === "Button") {
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (
              attr.name.name === "htmlType" &&
              attr.value &&
              attr.value.type === "Literal" &&
              attr.value.value === "submit"
            ) {
              context.report({
                node: attr,
                messageId: "noSubmitHtmlType",
              });
            }
          }
        }

        // ProForm* field components must have rules
        if (
          tagName.startsWith("ProForm") &&
          !PROFORM_CONTAINER_COMPONENTS.has(tagName)
        ) {
          let hasRules = false;
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (attr.name.name === "rules") {
              hasRules = true;
              break;
            }
          }
          if (!hasRules) {
            context.report({
              node: node,
              messageId: "needProFormRules",
              data: { tag: tagName },
            });
          }
        }
      },
    };
  },
};

export default rule;
