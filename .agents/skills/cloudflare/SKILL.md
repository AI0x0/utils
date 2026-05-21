---
name: cloudflare
description: Cloudflare Workers、OpenNext、Wrangler、Hyperdrive、Neon Postgres、环境变量、部署、远程迁移和线上故障排查约定。调整 Worker 构建、wrangler 配置、环境绑定、数据库连接、test/prod 发布时使用。
metadata:
  short-description: Cloudflare Workers 部署与运行时约定
---

# Cloudflare Workers 约定

适用于通过 `@opennextjs/cloudflare` 部署到 Cloudflare Workers，并通过 Hyperdrive 连接 Neon Postgres 的 Next.js 项目。

## 架构

```txt
Next.js App Router
  -> @opennextjs/cloudflare build
  -> Cloudflare Worker
  -> Hyperdrive
  -> Neon Postgres
```

本地开发通过 Wrangler 模拟 Worker 环境，`hyperdrive.localConnectionString` 指向本地 Postgres。

## 本地环境

```bash
pnpm install
cp .dev.vars.example .dev.vars
docker compose up -d my-postgres
pnpm db:migrate
pnpm dev
```

关键配置：

- `wrangler.jsonc` 的 `hyperdrive.localConnectionString` 是本地 PG 连接串的唯一定义点。
- `.dev.vars` 是 Wrangler 本地 secrets，会作为 Cloudflare env binding 注入。
- `.env.local` 只放品牌变量和 edge/proxy 必须读取的 `SESSION_SECRET`。
- 线上 secrets 使用 `pnpm exec wrangler secret put <KEY>`。

业务代码读取环境变量时，优先走项目封装的 `fileEnv` / `getCloudflareEnv()` / `getCloudflareEnvAsync()`，不要散落 `process.env`。

## Worker 构建约束

- 使用 `@opennextjs/cloudflare` 把 Next.js 打成 Worker。
- Worker 免费档 gzip 产物需小于 3 MiB。
- 管理后台重页面优先 `ssr:false` 动态加载。
- `scripts/patch-handler.mjs` 用于剔除不适合 Worker 免费档的包或压缩产物。
- `compatibility_flags` 必须包含 `nodejs_compat`；如果项目依赖公开 fetch 语义，也保留 `global_fetch_strictly_public`。
- Workers 跑不了原生模块，新增依赖前确认能在 Workers/nodejs_compat 下运行。
- `bcrypt` 用 `bcryptjs`，避免 `sharp` / `canvas` 这类原生绑定。

## 数据库与 Hyperdrive

- 线上数据库连接通过 `env.HYPERDRIVE.connectionString`。
- 本地 Wrangler 会把 `wrangler.jsonc` 的 `hyperdrive.localConnectionString` 注入为 Hyperdrive binding。
- 不要在业务代码里硬编码数据库连接串。
- 跨账号或多环境部署时，确认目标 Worker 账号、env 和 Hyperdrive binding 匹配。

本地迁移：

```bash
pnpm db:generate
pnpm db:migrate
```

远程 Neon 迁移推荐用 drizzle migrator 跑已生成的 SQL，不直接手工改 Neon：

```bash
DRIZZLE_DATABASE_URL='postgresql://...' \
  node -e "const{drizzle}=require('drizzle-orm/node-postgres');const{migrate}=require('drizzle-orm/node-postgres/migrator');const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DRIZZLE_DATABASE_URL,ssl:{rejectUnauthorized:false}});migrate(drizzle(p),{migrationsFolder:'./app/(backend)/db/migrations'}).then(()=>p.end())"
```

## 部署命令

```bash
pnpm run deploy:test
pnpm run deploy
```

典型脚本顺序：

1. `opennextjs-cloudflare build`
2. `node scripts/patch-handler.mjs`
3. `wrangler deploy --env=test` 或生产 env

发布前检查：

- `pnpm build` 通过。
- `pnpm exec eslint` 无错误。
- `pnpm db:generate` 无未提交 diff，schema 与 migrations 同步。
- 涉及 schema 变更时，migration 已推到对应 Neon 库。
- 新增 API 已生成 `openapi.json` 和前端 client。
- `.dev.vars.example` 同步新增 env key。
- 已确认部署账号、分支、Worker 名称、Hyperdrive 资源和目标域名。

## 回滚

Cloudflare Dashboard -> Workers -> 对应 Worker -> Deployments -> 选择历史版本 Rollback。

数据库变更不会自动回滚。删列、改类型等 migration 必须提前设计回滚或兼容路径。

## 常用命令

```bash
pnpm exec wrangler hyperdrive list
pnpm exec wrangler hyperdrive update <id> --connection-string='...'
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler tail --env=test --format=json
pnpm run deploy:test
pnpm run deploy
```

## 故障排查

| 现象                                    | 常见原因 / 处理                                                      |
| --------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev` 后 `/api/*` 401              | edge proxy 拿不到 `SESSION_SECRET`，`.env.local` 也要写同样的值      |
| `no local hyperdrive connection string` | `wrangler.jsonc` 未配置 `hyperdrive.localConnectionString`           |
| 登录 200 但列表 401                     | `.env.local` 与 `.dev.vars` 的 `SESSION_SECRET` 不一致               |
| `openapi.json` 生成失败                 | 先确保 dev server 已运行，端口与生成器配置一致                       |
| 线上 500 `数据库未初始化`               | Hyperdrive binding id、env 或账号不匹配                              |
| Worker bundle 超 3 MiB                  | 检查重页面是否动态加载、是否引入了不必要的大依赖                     |
| 线上 GET 读到旧数据                     | 优先排查 Cloudflare 缓存，API 路径需要明确 `Cache-Control: no-store` |

## 运行时注意事项

- Cloudflare Workers runtime 里同步 env 读取可能早于 binding 注入，API route 中优先使用 async env 读取封装。
- 后台任务或 `runInBackground` 里不要重新依赖可能为空的同步 env，必要时在请求上下文缓存连接串。
- `drizzle-zod` 与 Worker 构建偶尔会有运行时兼容问题，复杂 schema 可退回显式 zod object，但要保留类型意图。
- 自定义域名上的 API GET 可能被 CDN 缓存；对 `/api/*` 添加 no-cache/no-store 是重要保护。
- 使用 `wrangler tail --env=<env> --format=json` 看真实 Worker 日志，不只依赖本地推断。
