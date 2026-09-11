/**
 * 本地 ESLint plugin：封装项目自定义规则。
 */
import requireSectionDivider from "./require-section-divider.js";
import noHardcodedStyle from "./no-hardcoded-style.js";
import requireUseForm from "./require-use-form.js";
import requireFormConvention from "./require-form-convention.js";
import noAntdSpace from "./no-antd-space.js";
import noUseRequestRun from "./no-use-request-run.js";
import noThen from "./no-then.js";
import noOneLetterVars from "./no-one-letter-vars.js";
import noConsecutiveSetState from "./no-consecutive-setstate.js";
import maxLines from "./max-lines.js";
import apiRouteViaNrf from "./api-route-via-nrf.js";
import noDirectApiUrl from "./no-direct-api-url.js";
import noHardcodedText from "./no-hardcoded-text.js";

const rules = {
  "require-section-divider": requireSectionDivider,
  "no-hardcoded-style": noHardcodedStyle,
  "require-use-form": requireUseForm,
  "require-form-convention": requireFormConvention,
  "no-antd-space": noAntdSpace,
  "no-use-request-run": noUseRequestRun,
  "no-then": noThen,
  "no-one-letter-vars": noOneLetterVars,
  "no-consecutive-setstate": noConsecutiveSetState,
  "max-lines": maxLines,
  "api-route-via-nrf": apiRouteViaNrf,
  "no-direct-api-url": noDirectApiUrl,
  "no-hardcoded-text": noHardcodedText,
};

// 这三条只管「特定位置」的代码，不能跟着 recommended 全局开：
//   · api-route-via-nrf 只该挂在 API 路由文件上（别的文件 export 一个叫 GET 的函数是自由的）；
//   · no-direct-api-url 只该挂在前端目录上（后端与中间件里出现 "/api/..." 字面量是本分）；
//   · no-hardcoded-text 只该挂在做了国际化的项目上（没接语言包的项目开了就是满屏误报），
//     且旧账豁免名单由调用方经 legacy 选项传入。
// 调用方在 flat config 里用 files 圈定范围自行开启，豁免文件用 files override 关掉，
// 用法写在各条规则的文件头。
export const SCOPED_RULES = new Set([
  "api-route-via-nrf",
  "no-direct-api-url",
  "no-hardcoded-text",
]);

const plugin = {
  rules,
  configs: {
    recommended: {
      plugins: { ai0x0: { rules } },
      rules: {
        ...Object.fromEntries(
          Object.keys(rules)
            .filter((name) => !SCOPED_RULES.has(name))
            .map((name) => [`ai0x0/${name}`, "error"]),
        ),
        curly: "error",
        "ai0x0/max-lines": [
          "error",
          { max: 500, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  },
};

export default plugin;
