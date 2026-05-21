---
name: nextjs
description: Next.js App Router 项目的目录、路由、后端 API、Drizzle schema、OpenAPI 客户端生成和代码组织约定。新增/修改页面、API、DB schema、业务 action、公共 utils 或调整 Next.js 配置时使用。
metadata:
  short-description: Next.js 目录、API、DB 与代码组织约定
---

# Next.js 开发约定

适用于 Next.js 16 App Router + Turbopack 项目。前后端共存在 `app/` 下，通过路由分组隔离运行时边界。

## 目录分组

```txt
app/
├── (backend)/        # 后端独占：API 路由 + DB + 服务端 utils
├── (frontend)/       # 前端独占：页面 + 客户端 utils + 组件
├── (common)/         # 前后端共享：无运行时依赖的纯逻辑
├── manifest.ts
proxy.ts              # Next.js 16 Proxy，原 middleware，API 鉴权入口
```

路径别名：

- `@backend/*` -> `app/(backend)/*`
- `@frontend/*` -> `app/(frontend)/*`
- `@common/*` -> `app/(common)/*`
- `@/*` -> 项目根

跨 `(backend)` / `(frontend)` / `(common)` 边界 import 必须用别名，禁止相对路径跨边界。

## 放置位置决策

1. 依赖 Node-only API、数据库、环境密钥、`next/server` -> `(backend)`
2. 依赖浏览器 API、React hooks、antd、`next/navigation` -> `(frontend)`
3. 前后端都要用且零运行时依赖的类型、常量、纯函数、zod 片段 -> `(common)`
4. 含糊场景默认留在使用方分组，不要过度抽取

所有函数、工具、辅助逻辑必须放进对应分组的 `utils/`。页面、组件、schema、route 里不要导出工具函数。

## 文件与命名

- 自建文件和目录统一 kebab-case。
- React 组件导出用 PascalCase。
- 函数/变量用 camelCase。
- 常量用 SCREAMING_SNAKE_CASE。
- hook 文件名用 `use-<name>.tsx`。
- 路由文件固定 `route.ts`，页面文件固定 `page.tsx` / `layout.tsx`。
- 私有辅助模块可用 `_helper.ts`。

新建文件时按这个顺序判断：

```txt
路由 -> app/(backend)/api/<resource>[/子路径]/route.ts
页面 -> app/(frontend)/admin/<resource>/page.tsx
仅本页组件 -> 页面同目录 <kebab-name>.tsx
复用组件 -> app/(frontend)/components/<kebab-name>.tsx
React hook -> app/(frontend)/hooks/use-<name>.tsx
后端业务函数 -> app/(backend)/utils/actions/<name>.ts
后端工具 -> app/(backend)/utils/<topic>/
前端工具 -> app/(frontend)/utils/<kebab-name>.ts
共享纯逻辑 -> app/(common)/<utils|types|constants>/
```

## 单一职责

一个文件只围绕一件事组织，文件名应该能预测文件内容。

- 一个文件只有一个主角。
- 文件名等于主角名。
- 文件超过约 150 行、出现两组互不调用的功能、导出超过 5 个不强相关 symbol、import 依赖明显分裂时，优先拆分。
- 页面目录下的子文件默认私有，只服务该页面。
- `schemas/index.ts`、`apis/index.tsx`、`generator/`、框架配置文件可以聚合，但聚合文件里不要塞业务逻辑。

## API 路径规范

```txt
app/(backend)/api/
├── route.ts                    -> GET /api，OpenAPI 文档
├── <resource>/
│   ├── route.ts                -> GET/POST/PUT/DELETE /api/<resource>
│   └── list/
│       └── route.ts            -> GET /api/<resource>/list
```

强制规则：

- 资源名单数、kebab-case：`/api/key`、`/api/api-key`。
- 列表接口必须是 `GET /api/<resource>/list`，不要把 `GET /api/<resource>` 当列表。
- 详情接口用 `GET /api/<resource>?id=xxx` 或唯一查询参数，避免 `/api/<resource>/<id>`。
- 操作类路径用子目录：`/api/key/verify`、`/api/email/code/verify`，不要用 query action。
- 多级路径必须有父子依赖关系。
- 标准增删改查尽量放同一个 `app/(backend)/api/<resource>/route.ts`，只有列表固定放 `/list`。

## 后端 API

每个 `route.ts` 用 `next-rest-framework` 的 `route({...})` 组装命名操作，通过解构 HTTP 动词导出。

优先使用 `@backend/utils/route-operation` 的工厂：

- `postOperation`
- `putOperation`
- `deleteOperation`
- `getOperation`
- `getListOperation`

只有这些场景才手写 `routeOperation`：

- multipart/form-data 上传。
- upsert 或非标准写入语义。
- 代理、文件流、非 JSON 响应。
- 需要完全自定义响应或特殊副作用。

`postOperation` / `putOperation` 支持：

- `setBody(req)`：写入前合入字段，如随机 key、`userId`、租户 id。
- `onSuccess(data)`：写入成功后的加工或副作用，必须返回最终响应数据。
- `onError(error)`：定制错误响应；否则交给默认 PG 约束错误翻译。

路由 handler 只做参数验证、组合 action、包装响应；DB 查询和业务逻辑放 `app/(backend)/utils/actions/*.ts`。

## DB Schema

每张表一个 schema 文件：

```txt
app/(backend)/db/
├── index.ts
├── schemas/
│   ├── <resource>.ts
│   └── index.ts
└── migrations/
```

约定：

- 用 `createTableSchema` 统一产出 `table` + `selectSchema`，并注入公共字段。
- 用 `createInsertSchema(table)` 生成 insert schema。
- 用 `queryListSchema(...)` 生成列表查询 schema。
- `schemas/*.ts` 只定义表和 zod schema，不写查询函数。
- 新表后在 `schemas/index.ts` 追加 `export * from "./<resource>"`。
- 每次 schema 变更必须 `pnpm db:generate`，迁移文件必须由命令生成，不手写或手改 migration/meta。

## OpenAPI 与前端 Client

后端 OpenAPI 文档入口在 `app/(backend)/api/route.ts`。

生成流程：

```bash
pnpm dev
pnpm openapi:json:generate
pnpm openapi:client:generate
```

- `public/openapi.json` 来自运行中的 dev server。
- `app/(frontend)/apis/generator/` 是 openapi-generator 产物，不手改。
- 新增 tag 后，在 `app/(frontend)/apis/index.tsx` 追加对应 `XxxApiFactory`。

## 认证入口

`proxy.ts` 统一拦截 `/api/:path*`：

- `publicRoutes` 按 path + method 白名单。
- Session 通过 `@backend/utils/session` 解密 JWT。
- API Key 通过 `validateApiKey` 校验。
- 新路由默认受保护，只有明确需要免登录时才加白名单。

## TypeScript 与代码风格

- TypeScript `strict: true`，显式处理 null/undefined。
- import 顺序：外部包 -> `@backend/@frontend/@common/@ai0x0/utils` -> 相对路径。
- 字符串双引号、两空格缩进、末尾逗号。
- 注释用简短中文说明段落意图，不逐行翻译代码。
- 错误提示统一走上层错误处理或前端 app bridge，不要 `alert` / 裸 `console.log`。
- `ai0x0.configs.recommended` 中所有自定义规则都是 `error`，同时开启 `curly: "error"`。
- 所有 `if` / `for` / `while` / `else` 块必须写花括号，不写单行裸语句。
- 禁止 `.then()`，Promise 链统一改成 `async/await`。
- 禁止单字母变量名，`_`、for 循环迭代变量、泛型类型参数例外。

## 禁止 try/catch

业务代码不要写 `try { ... } catch { ... }`。

- 后端错误交给 `next-rest-framework`、`route-operation` 和 `onError`。
- 前端请求错误交给 axios 拦截器、`useRequest`、app message。
- fire-and-forget 副作用只允许 `.catch((e) => console.error(...))` 做最终兜底。

允许例外：

- `JSON.parse`、`atob`、第三方无类型库等解析容错。
- setup/proxy 等框架底层入口需要兜住请求生命周期。
- 测试中优先用 `expect(...).rejects`，不要额外包 try/catch。

## 禁止散落 `as`

- 不要在业务文件里重复声明 OpenAPI 已生成的 enum union。
- 前端 enum 使用 generator 导出的 `XxxEnum` 值和 `XxxType` 类型。
- 禁止散落 `as T`，`as const` 例外。
- JSONB / unknown 等边界，把断言收敛到命名小帮手，并用 eslint disable 注释说明原因。

## 文件分区

超过约 150 行、或顶层出现多种代码的 `.ts` / `.tsx`，用中文等号分隔块组织：

```ts
// ==============================================================================
// 类型 & 常量
// ==============================================================================

// ==============================================================================
// 主组件 Xxx：一句话描述职责
// ==============================================================================
```

组件体内分区宽度用 76 个等号，常用分区名：`数据请求`、`副作用`、`派生数据 & 小工具`、`操作`、`渲染`。

ESLint 按行数强制分区数量：

- 150 行起至少 1 个分区块。
- 300 行起至少 2 个分区块。
- 450 行起至少 3 个分区块。
- 之后每约 150 行再增加 1 个分区块。

分区块必须是连续三行 `//` 注释，中间行写中文标题，上下行是 4 个以上等号。

## ESLint 规则速查

推荐配置会启用这些强制规则：

- `ai0x0/no-then`：禁止 `.then()`，使用 `async/await`。
- `ai0x0/no-one-letter-vars`：禁止单字母变量名。
- `ai0x0/require-section-divider`：大文件必须用等号注释块分区。
- `ai0x0/no-hardcoded-style`：前端样式值必须走 antd token。
- `ai0x0/no-antd-space`：禁止 `<Space>` / `<Space.Compact>`，使用 `<Flex>`。
- `ai0x0/require-use-form`：表单字段状态不能用 `useState` / `useSetState` 管。
- `ai0x0/require-form-convention`：Form 必须 `onFinish`，字段必须 rules，禁止 Modal.onOk 提交。
- `ai0x0/require-pro-components`：业务表单优先 ProComponents。
- `ai0x0/no-use-request-run`：禁止解构 `run`，使用 `runAsync` 并在调用处 `await`。
- `ai0x0/no-consecutive-setstate`：连续 `setState({ ... })` 要合并成一次。

## 常用命令

```bash
pnpm exec tsc
pnpm exec eslint
pnpm exec eslint --fix
pnpm db:generate
pnpm db:migrate
pnpm openapi:json:generate
pnpm openapi:client:generate
```
