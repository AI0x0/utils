/**
 * require-form-convention
 * -----------------------
 * 约束表单组件必须遵守以下规范：
 *
 * 1. <Form> 必须使用 onFinish 提交
 * 2. <Form.Item> 必须使用 rules 进行表单校验
 * 3. 禁止在 useRequest 中使用 message.error 报错
 * 4. Modal + Form 组合时，禁止用 Modal.onOk 提交
 *
 * 例外通过文件路径 overrides 处理（utils、hooks、theme 等已豁免）。
 */

/** @type {import('eslint').Rule.RuleModule} */

// ==============================================================================
// 规则实现
// ==============================================================================

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "表单组件必须使用 Form.onFinish，Form.Item 必须使用 rules，禁止 useRequest 内 message.error，禁止 Modal.onOk 提交表单。",
    },
    schema: [],
    messages: {
      needOnFinish:
        "<Form> 必须使用 onFinish 属性提交表单，禁止用 form.validateFields() 或 Modal.onOk 手动提交。",
      needItemRules:
        "<Form.Item> 必须设置 rules 进行校验。如果确实不需要校验，请用 // eslint-disable-next-line 注明原因。",
      noMessageError:
        "禁止在 useRequest 的 onSuccess/onError 回调中使用 message.error。错误提示应通过 antd Form.Item 的 rules 或 Form onFinish 的错误处理来展示。",
      noModalOnOk:
        "Modal + Form 组合时，禁止使用 Modal.onOk 提交。请使用 Form.onFinish。",
      noMessageErrorAny:
        "禁止使用 app?.message.error 报错，请求拦截器已统一处理。请移除该行。",
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    let hasFormTag = false;
    let hasFormOnFinish = false;
    const formItemNoRules = [];
    const useRequestCalls = [];
    const modalOnOkAttrs = [];
    const validateFieldsCalls = [];

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

        // <Form>
        if (tagName === "Form") {
          hasFormTag = true;
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (attr.name.name === "onFinish") {
              hasFormOnFinish = true;
            }
          }
          if (!hasFormOnFinish) {
            context.report({
              node: node,
              messageId: "needOnFinish",
            });
          }
        }

        // <Form.Item>
        if (tagName === "Form.Item") {
          let hasRules = false;
          let isNoStyle = false;
          let hasName = false;
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (attr.name.name === "rules") hasRules = true;
            if (attr.name.name === "noStyle") isNoStyle = true;
            if (attr.name.name === "name") hasName = true;
          }
          // noStyle 或 <Form.List> 内的 Item 不需要 rules
          if (!hasRules && !isNoStyle && hasName) {
            formItemNoRules.push(node);
          }
        }

        // <Modal onOk={...}>
        if (tagName === "Modal") {
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || !attr.name) continue;
            if (attr.name.name === "onOk") {
              modalOnOkAttrs.push(attr);
            }
          }
        }
      },

      CallExpression(node) {
        // app?.message.error() — 请求拦截器已统一处理，禁止手动调用
        // app?.message.error() — 请求拦截器已统一处理，禁止手动调用
        const callText = sourceCode.getText(node);
        if (
          callText.includes("message.error") &&
          callText.startsWith("app") &&
          callText.includes(".error(")
        ) {
          context.report({
            node: node,
            messageId: "noMessageErrorAny",
          });
          return;
        }
        // useRequest()
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "useRequest"
        ) {
          useRequestCalls.push(node);
        }

        // .validateFields()
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "validateFields"
        ) {
          validateFieldsCalls.push(node);
        }
      },

      "Program:exit"() {
        // 1. Form.Item without rules
        for (const item of formItemNoRules) {
          context.report({
            node: item,
            messageId: "needItemRules",
          });
        }

        // 2. message.error in useRequest callbacks
        for (const call of useRequestCalls) {
          const options = call.arguments[1];
          if (!options || options.type !== "ObjectExpression") continue;
          for (const prop of options.properties) {
            if (prop.type !== "Property") continue;
            const key = prop.key;
            if (
              key.type !== "Identifier" ||
              (key.name !== "onSuccess" &&
                key.name !== "onError" &&
                key.name !== "onFinally")
            )
              continue;
            const text = sourceCode.getText(prop.value);
            if (text.includes("message.error")) {
              context.report({
                node: prop,
                messageId: "noMessageError",
              });
            }
          }
        }

        // 3. Modal.onOk
        for (const attr of modalOnOkAttrs) {
          context.report({
            node: attr,
            messageId: "noModalOnOk",
          });
        }

        // 4. form.validateFields()
        if (hasFormTag && !hasFormOnFinish) {
          for (const call of validateFieldsCalls) {
            context.report({
              node: call,
              messageId: "needOnFinish",
            });
          }
        }
      },
    };
  },
};

export default rule;
