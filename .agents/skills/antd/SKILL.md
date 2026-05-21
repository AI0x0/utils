---
name: antd
description: Ant Design / Ant Design Pro 前端页面、表单、ProTable、ModalForm、主题 token、布局组件和 ahooks 数据流约定。新增或修改业务 UI、表单、搜索筛选、配置面板、管理后台 CRUD 页面时使用。
metadata:
  short-description: Ant Design 表单、页面与主题约定
---

# Ant Design 开发约定

适用于基于 antd、Ant Design Pro、ProComponents、antd-style、ahooks 的业务前端。

## 客户端组件与 API

- 需要交互或状态的组件首行加 `"use client"`。
- API 调用统一走 `@frontend/apis`，类型来自 `@frontend/apis/generator`。
- 生成产物不要手改；接口或 schema 变更后重新生成 OpenAPI client。
- 全局状态用 `unstated-next` 的 `data-store.tsx`。
- 弹出类 UI 用 `app/(frontend)/app.tsx` 暴露的 `app`，避免 antd 静态方法告警。

## 表单核心规则

所有表单组件必须使用 `Form.useForm()`、ahooks/rc-field-form 的 `useForm` 或 ProComponents 内建 form 管理状态。

禁止在表单场景中使用：

- `useState` 直接绑定多个字段的 `value` + `onChange`
- 裸 `useRef` 读取输入值
- 手动拼接对象后提交

适用范围：

- 数据录入表单
- 搜索 / 筛选面板
- 聊天输入框里的多字段输入
- 配置弹窗 / Drawer
- 任意包含两个及以上输入控件的组件

例外：

- 纯展示文本
- 单一开关 / 单选且无需校验
- 第三方组件已经内部封装 Form

ESLint 会把“同一文件里存在受控输入 `value` + `onChange`，同时使用 `useState` / `useSetState`”识别为违规表单状态管理。遇到多字段输入时，直接上 Form，不要先写本地 state 再迁移。

## 表单与请求

表单提交配合 `useRequest`，不要在 `onFinish` 里裸写 async/await 和 try/catch。

```tsx
const { run: submit } = useRequest(
  async (values) => {
    await apis.postSomething({ body: values });
  },
  { manual: true },
);

<Form form={form} onFinish={submit} />;
```

辅助说明文字使用 `Form.Item` 的 `help`，不要拼进 `label` 字符串。

强制表单约定：

- `<Form>` 必须用 `onFinish` 提交。
- 有 `name` 的 `<Form.Item>` 必须写 `rules`，`noStyle` 例外。
- Modal + Form 组合禁止用 `Modal.onOk` 提交，改用 `Form.onFinish`。
- 禁止 `form.validateFields()` + 手动提交的模式。
- 请求错误由拦截器统一处理，禁止在 `useRequest` 回调里 `message.error` / `app?.message.error`。

## ProComponents CRUD 页面

管理页优先使用 `ProTable` + `ModalForm`。

```tsx
"use client";

import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormText, ProTable } from "@ant-design/pro-components";
import apis from "@frontend/apis";

const columns: ProColumns<Row>[] = [
  { title: "名称", dataIndex: "name" },
  {
    title: "创建时间",
    dataIndex: "createdAt",
    valueType: "dateRange",
    search: {
      transform: (value) => ({
        createdAtFrom: value[0],
        createdAtTo: value[1],
      }),
    },
    editable: false,
  },
];

const Page = () => (
  <ProTable
    columns={columns}
    request={async (query) => {
      const { data } = await apis.getKeyList(query);
      return { data: data.data, success: true, total: data.total };
    }}
  />
);
```

约定：

- `ProTable request` 必须返回 `{ data, success, total }`，否则分页不生效。
- 时间范围列用 `valueType: "dateRange"` + `search.transform` 映射 `<field>From/<field>To`。
- 图片表单列用 `renderFormItem` 接入上传组件。
- 删除走 `Popconfirm`。
- 提交成功后调用 `action?.reload()`。

业务表单优先 ProComponents：

- 禁止直接用 antd `<Modal>`，使用 `ModalForm`。
- 禁止直接用非 `noStyle` 的 `<Form.Item>`，使用 `ProFormText` / `ProFormSelect` / `ProFormItem` 等。
- `ProForm*` 字段组件必须设置 `rules`；容器类 `ProForm`、`ProFormGroup`、`ProFormList`、`ProFormDependency` 例外。
- 禁止 `<Button htmlType="submit">`，通过 ProForm 的 `submitter` 配置提交按钮。

## 布局与文本

业务页面禁止用 `<div>` / `<span>` / `<p>` / `<h1-6>` 承载布局或文本，优先使用 antd 组件。

- 布局容器 -> `Flex`
- 纯文本 -> `Typography.Text` / `Typography.Paragraph` / `Typography.Title`
- 次级、危险、警告、成功文本 -> `Text type="secondary|danger|warning|success"`
- Badge、Tag、Avatar、Image、Button 等使用 antd 对应组件

允许例外：

- 框架或第三方组件必须的结构标签。
- 纯 Portal / ref 挂载点。
- SVG 内部元素。
- antd 没有对等组件的语义标签，如必要的外链 `<a target>`。
- 禁止 antd `<Space>` / `<Space.Compact>`，使用 `<Flex>`。

Space 到 Flex 的常见替换：

- `<Space direction="vertical">` -> `<Flex vertical>`
- `<Space size={token.paddingSM}>` -> `<Flex gap={token.paddingSM}>`
- `<Space wrap>` -> `<Flex wrap="wrap">`
- `<Space.Compact>` -> 用 `<Flex>` 和 token 自行实现紧凑排列

提交前在改动范围内检查：

```bash
rg -n "<(div|span|p|h[1-6])[ >]"
```

## 主题与样式

- 使用 antd 6 + `antd-style`。
- 顶层用 `@ant-design/nextjs-registry` 的 `AntdRegistry` 包裹，不再写 `unstable_setRender` 或自定义 `StyleRegistry`。
- 主题色从全局 env/store 读取，开启 `cssVar: {}`。
- 中文语言包统一在 theme 入口设置 `ConfigProvider locale={zhCN}` 和 `dayjs.locale("zh-cn")`。

所有前端样式必须走 antd token，禁止硬编码视觉值：

- 颜色：`#fff`、`rgb(...)`、`rgba(...)`、`hsl(...)`
- 间距/字号/圆角：`12px`、`8px 16px`
- 阴影：`0 2px 8px rgba(...)`

推荐：

```tsx
import { createStyles } from "antd-style";

const useStyles = createStyles(({ token, css }) => ({
  card: css`
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    padding: ${token.paddingLG}px;
    box-shadow: ${token.boxShadowTertiary};
  `,
}));
```

允许例外：

- `0`。
- CSS 功能性关键字，如 `auto`、`none`、`hidden`、`pointer`、`center`、`flex`、`grid`、`relative`。
- 条件表达式、变量、函数调用、`calc()` / `min()` / `max()` / `clamp()`。
- `css`` 中通过 `${token.xxx}` 插值的值。
- `100%`、`100vh`、`100vw` 等布局尺寸。
- 第三方库强制要求的字面量，但要用中文注释说明原因。

检查硬编码视觉值：

```bash
rg -n "#[0-9a-fA-F]{3,8}\\b|rgba?\\(|hsla?\\(|[0-9]+(px|rem|em)\\b"
```

## ahooks 数据流

业务组件里请求、定时器、防抖、节流、生命周期、布尔状态等优先用 ahooks。

| 需求               | 避免                               | 推荐                              |
| ------------------ | ---------------------------------- | --------------------------------- |
| 请求 / 加载 / 错误 | `useState + useEffect + try/catch` | `useRequest`                      |
| 防抖 / 节流        | 自写 `setTimeout`                  | `useDebounceFn` / `useThrottleFn` |
| 挂载 / 卸载        | 手写 mounted 状态                  | `useMount` / `useUnmount`         |
| 上一个值           | 自写 ref 比较                      | `usePrevious`                     |
| 定时器             | `setInterval` + cleanup            | `useInterval` / `useTimeout`      |
| URL 状态           | 手写 router/searchParams           | `useUrlState`                     |
| 布尔开关           | 多个 setter                        | `useBoolean` / `useToggle`        |

业务页面 / 组件不要直接写请求型 `useEffect`。如果确实需要底层 `useEffect`，在函数上方用中文注释说明为什么 ahooks 覆盖不了。

按钮请求标准链路：`manual: true` + `runAsync` + `await` + `refresh`，不要自己维护 loading、try/catch 和 toast。

`useRequest` 解构时禁止使用 `run` 或 `run: alias`：

```tsx
const { runAsync: submit } = useRequest(save, { manual: true });

await submit(values);
```

连续多个 `setState({ ... })` 要合并成一次：

```tsx
setState({ open: false, current: undefined });
```

## 类型与枚举

- 不要手写 `"a" | "b" | "c"` 重复 OpenAPI enum。
- `Segmented`、`Menu`、Tabs 的 value/key 使用 generator 导出的 `XxxEnum`。
- props、state、request body 使用 generator 导出的类型。
- 对象字面量符合接口时用 `satisfies`，不要 `as T`。

## ESLint 规则对应

- `require-use-form`：受控表单字段必须交给 Form 管理。
- `require-form-convention`：Form/onFinish/rules/Modal 提交/错误提示约定。
- `require-pro-components`：ModalForm、ProForm 字段和 submitter 约定。
- `no-hardcoded-style`：token 样式约定。
- `no-antd-space`：Flex 替代 Space。
- `no-use-request-run`：`runAsync` 替代 `run`。
- `no-consecutive-setstate`：合并连续 setState。

## 前端自检

- 新增/修改 UI 后跑 `pnpm exec tsc` 和 `pnpm exec eslint`。
- 表单场景确认由 Form 管理状态。
- ProTable request 确认返回 `total`。
- 业务文本和布局确认使用 antd 组件。
- 样式确认使用 token。
- 涉及真实交互时在浏览器点一次受影响页面，确认 Console 无 error/warning。
