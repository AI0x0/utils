/**
 * 本地 ESLint plugin：封装项目自定义规则。
 */
import requireSectionDivider from "./require-section-divider.js";
import noHardcodedStyle from "./no-hardcoded-style.js";
import requireUseForm from "./require-use-form.js";
import requireFormConvention from "./require-form-convention.js";
import requireProComponents from "./require-pro-components.js";
import noAntdSpace from "./no-antd-space.js";
import noUseRequestRun from "./no-use-request-run.js";
import noThen from "./no-then.js";
import noOneLetterVars from "./no-one-letter-vars.js";
import noConsecutiveSetState from "./no-consecutive-setstate.js";

const rules = {
  "require-section-divider": requireSectionDivider,
  "no-hardcoded-style": noHardcodedStyle,
  "require-use-form": requireUseForm,
  "require-form-convention": requireFormConvention,
  "require-pro-components": requireProComponents,
  "no-antd-space": noAntdSpace,
  "no-use-request-run": noUseRequestRun,
  "no-then": noThen,
  "no-one-letter-vars": noOneLetterVars,
  "no-consecutive-setstate": noConsecutiveSetState,
};

const plugin = {
  rules,
  configs: {
    recommended: {
      plugins: { ai0x0: { rules } },
      rules: {
        ...Object.fromEntries(
          Object.keys(rules).map((name) => [`ai0x0/${name}`, "error"]),
        ),
        curly: "error",
        "max-lines": [
          "error",
          { max: 500, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  },
};

export default plugin;
