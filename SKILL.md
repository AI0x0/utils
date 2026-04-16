---
name: ai0x0-utils-backend
description: Scaffold Next.js App Router CRUD endpoints and drizzle-orm(pg) tables with `@ai0x0/utils`. Use when a project needs standard list/get/create/update/delete routes backed by drizzle-orm + zod + next-rest-framework, auto-injected base fields (id / creatorId / createdAt…), paginated list queries with joins, or ready-to-use select/insert/update Zod schemas. Pair with the `create-next-rest-framework-api` skill — this skill replaces hand-written `routeOperation(...).input(...).outputs(...).handler(...)` chains with a declarative factory API exposed inside `next-rest-framework`'s `route({...})`.
---

# @ai0x0/utils Backend

Declarative CRUD factory on top of `next-rest-framework` v6, `drizzle-orm/pg-core`, `drizzle-zod`, and `zod` v4. Each factory returns a `RouteOperationDefinition<Method>` so it plugs directly into `route({ … })` from next-rest-framework.

## Workflow

1. Create a shared options module (once per project) that pre-binds `{ db, getSession }` to every operation factory (see "Project Setup" below). Route files never import `db`/`getSession` directly.
2. For each domain entity, place a `table.ts` next to an `index.ts`:
   - `table.ts` — call `createTableSchema({ name, columns })` and re-export `table` only.
   - `index.ts` — compose the zod schemas (`insertXxxSchema`, `selectXxxSchema`, `updateXxxSchema`, `queryXxxSchema`, `queryListXxxSchema`, `queryListSelectXxxSchema`). Extend with `.merge(z.object(...))` when the business exposes non-column fields (tags, computed columns).
3. Author the CRUD `route.ts` by wrapping the pre-bound operations inside next-rest-framework's `route({...})`. Name each operation key descriptively — it is the OpenAPI `operationId`.
4. Drop down to raw `routeOperation(...)` (via the `create-next-rest-framework-api` skill) when the endpoint is non-CRUD (auth, webhooks, streaming, multi-status) or needs custom `TypedNextResponse` unions.
5. Reuse action-level helpers (`createGetAction`, `createGetListAction`, etc.) inside server actions, cron jobs, queue consumers, or the raw-`routeOperation` handlers — same API, no request wrapping.

## Project Setup

Create three files once and reuse everywhere:

```ts
// app/(backend)/db/schemas/_helper.ts — re-export + lock import path
export {
  createTableSchema,
  queryListSchema,
  listBodySchema,
} from "@ai0x0/utils/lib/backend/schemas";
```

```ts
// app/(backend)/utils/actions/_helper.ts — action-level helpers
export {
  createDeleteAction,
  createGetAction,
  createGetListAction,
  createPostAction,
  createPutAction,
} from "@ai0x0/utils/lib/backend/actions";
```

```ts
// app/(backend)/utils/route-operation/index.ts — pre-bind db + getSession
import {
  createGetOperation,
  createPutOperation,
  createPostOperation,
  createDeleteOperation,
  createGetListOperation,
} from "@ai0x0/utils/lib/backend";
import { db } from "@backend/db";
import getSession from "@backend/utils/get-session";

export const postOperation = createPostOperation({ db, getSession });
export const deleteOperation = createDeleteOperation({ db, getSession });
export const putOperation = createPutOperation({ db, getSession });
export const getOperation = createGetOperation({ db, getSession });
export const getListOperation = createGetListOperation({ db, getSession });
```

`getSession(req)` **must** return `{ userId?: string } | undefined` (a Promise is fine). Throwing rejects the request; returning `undefined` disables ownership checks for that call.

## Factory Catalog

| Export              | Purpose                    | Required options                     | Notable optional options                                                                    |
| ------------------- | -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `createTableSchema` | pg `Table` + 5 zod schemas | `name`, `columns`                    | `refineSchema`, `extraConfig`                                                               |
| `getOperation`      | GET one by filters         | `table`, `bodySchema`, `querySchema` | `setParams`, `relations`, `jsonArrayFields`, `byCreator`, `onSuccess`, `onError`, `summary` |
| `getListOperation`  | GET paginated list         | `table`, `bodySchema`, `querySchema` | `setParams`, `relations`, `jsonArrayFields`, `onSuccess`, `onError`, `summary`              |
| `postOperation`     | POST create                | `table`, `bodySchema`                | `outputBodySchema`, `setBody`, `onSuccess`, `onError`, `summary`                            |
| `putOperation`      | PUT update                 | `table`, `bodySchema`                | `outputBodySchema`, `setBody`, `byCreator`, `onSuccess`, `onError`, `summary`               |
| `deleteOperation`   | DELETE                     | `table`                              | `byCreator`, `onSuccess`, `onError`, `summary`                                              |

## Canonical Examples

### 1. Table + schemas (`table.ts` + `index.ts`)

```ts
// app/(backend)/db/schemas/agent/table.ts
import { jsonb, text } from "drizzle-orm/pg-core";
import { createTableSchema } from "@backend/db/schemas/_helper";

export const agentColumns = {
  name: text("name"),
  modelId: text("model_id"),
  tags: jsonb("tags"),
  mcpIds: jsonb("mcp_ids"),
};

export const { table: agents } = createTableSchema({
  name: "agents",
  columns: agentColumns,
});
```

```ts
// app/(backend)/db/schemas/agent/index.ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { queryListSchema } from "@backend/db/schemas";
import { agents } from "./table";

export { agents, agentColumns } from "./table";

export const insertAgentSchema = createInsertSchema(agents).merge(
  z.object({
    mcpIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
);
export const selectAgentSchema = createSelectSchema(agents).merge(
  z.object({
    mcpIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
);
export const updateAgentSchema = insertAgentSchema.required({ id: true });
export const queryAgentSchema = insertAgentSchema.partial();
export const queryListAgentSchema = queryListSchema(
  selectAgentSchema.partial().merge(
    z.object({ tags: z.string().optional() }), // 列表里 jsonArray 以逗号分隔字符串传入
  ),
);
export const queryListSelectAgentSchema = selectAgentSchema;
```

Note the two-layer shape: `queryListSchema(...)` input is the **partial of the select schema** (optionally merged with extra querystring-only fields); `bodySchema` in `getListOperation` stays as the full select schema (`queryListSelectAgentSchema`).

### 2. Detail CRUD route

```ts
// app/(backend)/api/agent/route.ts
import { route } from "next-rest-framework";
import {
  agents,
  insertAgentSchema,
  queryAgentSchema,
  selectAgentSchema,
  updateAgentSchema,
} from "@backend/db/schemas";
import {
  deleteOperation,
  getOperation,
  postOperation,
  putOperation,
} from "@backend/utils/route-operation";
import getSession from "@backend/utils/get-session";
import { seedAgentData } from "@backend/utils/actions";

export const { POST, GET, DELETE, PUT } = route({
  getAgent: getOperation({
    querySchema: queryAgentSchema,
    bodySchema: selectAgentSchema,
    table: agents,
    summary: "助手详情",
    setParams: async (req) => {
      const { userId } = (await getSession(req)) || {};
      await seedAgentData(userId as string);
      return {};
    },
  }),
  postAgent: postOperation({
    bodySchema: insertAgentSchema,
    table: agents,
    summary: "添加助手",
    setBody: async () => ({ tags: ["my"] }),
  }),
  putAgent: putOperation({
    bodySchema: updateAgentSchema,
    table: agents,
    summary: "编辑助手",
  }),
  deleteAgent: deleteOperation({
    table: agents,
    summary: "删除助手",
  }),
});
```

### 3. List route with relations + `onSuccess` tree building

```ts
// app/(backend)/api/channel/list/route.ts
import { route } from "next-rest-framework";
import { eq, sql } from "drizzle-orm";
import {
  channels,
  models,
  queryListChannelSchema,
  queryListSelectChannelSchema,
} from "@backend/db/schemas";
import { getListOperation } from "@backend/utils/route-operation";
import getSession from "@backend/utils/get-session";
import { seedChannelData } from "@backend/utils/actions/channel";

export const { GET } = route({
  getChannelList: getListOperation({
    querySchema: queryListChannelSchema,
    bodySchema: queryListSelectChannelSchema,
    table: channels,
    summary: "获取渠道列表",
    relations: [
      {
        table: models,
        sql: eq(models.channelId, channels.id),
        select: {
          models: sql`(
            SELECT array_agg(DISTINCT jsonb_strip_nulls(to_jsonb(models.*)))
            FROM ${models}
            WHERE ${models.channelId} = ${channels.id}
          )`,
        },
      },
    ],
    setParams: async (req) => {
      const { userId } = (await getSession(req)) || {};
      await seedChannelData(userId as string);
      return {};
    },
    onSuccess: async (result) => {
      // 内部字段过滤 / 映射 / 树化都写在这里
      return result;
    },
  }),
});
```

For list routes that consume `jsonb` arrays as comma-separated querystring values, add `jsonArrayFields: ["tags"]`.

### 4. Escape hatch — drop to raw `routeOperation` but reuse actions

When the endpoint returns multiple status shapes (e.g. 200 success + 401 unauthorized), do **not** use the CRUD factories. Call `routeOperation` directly and reuse the action helpers for the database side:

```ts
// app/(backend)/api/user/me/route.ts
import { TypedNextResponse, route, routeOperation } from "next-rest-framework";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@backend/db";
import { members, selectUserSchema, teams, users } from "@backend/db/schemas";
import { createGetAction } from "@backend/utils/actions";
import getSession from "@backend/utils/get-session";

export const { GET } = route({
  getUserMe: routeOperation({
    method: "GET",
    openApiOperation: { tags: ["users"], summary: "我的信息" },
  })
    .outputs([
      { status: 200, contentType: "application/json", body: selectUserSchema },
      {
        status: 401,
        contentType: "application/json",
        body: z.object({ message: z.string() }),
      },
    ])
    .handler(async (req) => {
      const { userId } = (await getSession(req)) || {};
      const user = await createGetAction({
        db,
        table: users,
        bodySchema: selectUserSchema,
        relations: [
          { table: members, sql: eq(members.userId, users.id) },
          {
            groupBy: true,
            table: teams,
            select: { team: teams },
            sql: eq(teams.id, members.teamId),
          },
        ],
      })({ id: userId });
      if (!user) {
        return TypedNextResponse.json(
          { message: "用户不存在" },
          { status: 401 },
        );
      }
      return TypedNextResponse.json(user, { status: 200 });
    }),
});
```

## Built-in Conventions

- **Base fields** auto-added by `createTableSchema`: `id` (uuid, pk, default random) / `creatorId` / `editorId` / `accessedAt` / `createdAt` / `updatedAt`.
- **Ownership check**: with `byCreator: true` (default on PUT/DELETE/GET), PUT/DELETE pre-fetch the row filtered by `creatorId = session.userId` and throw `"未找到…对象，或没有权限"` if missing. Set `byCreator: false` to skip (e.g. admin endpoints).
- **Auto injection**: POST writes `creatorId = session.userId`; PUT writes `editorId = session.userId`; GET/GET_LIST append `creatorId = session.userId` to the filter when `byCreator` is on.
- **Date coercion**: any body field ending in `At` is passed through `dayjs(value).toDate()` before write — accept ISO strings from clients.
- **List filtering** (all querystring values are strings):
  - `key=a,b,c` → `IN (...)` when key ends with `Id`; otherwise `OR ILIKE %a% OR ILIKE %b%`
  - `key=foo` where key ends with `Id` → `eq`; otherwise `ILIKE %foo%`
  - `${anything}AtFrom` / `${anything}AtTo` → `gte` / `lte` against the matching `${anything}At` column
  - `jsonArrayFields: ["tags"]` → `EXISTS (SELECT 1 FROM jsonb_array_elements_text(col) t WHERE t LIKE %v%)`
- **Pagination / sort**: `current` (default `"1"`), `pageSize` (default `"10"`), `orderBy` (default `createdAt`), `orderDir` (`asc|desc`, default `desc`).
- **Relations**: `relations: [{ table, sql, select, groupBy? }]` drives `leftJoin` + optional `groupBy(root.id, relation.id)`; `select` merges into the final `SELECT` projection and can contain raw `sql\`…\`` correlated sub-queries.

## Guardrails

- Always pass `insertXxxSchema` to POST, `updateXxxSchema` (has `.required({ id: true })`) to PUT, `selectXxxSchema` to GET body, `queryListSchema(selectXxxSchema.partial())` to GET_LIST query.
- Query-string schemas stay `z.string()` — numbers / arrays from querystrings must stay strings and be parsed inside `onSuccess` or `setParams`.
- Do not reuse `insertSchema` for PUT — missing `id` silently dispatches an update without a where clause.
- `bodySchema` on list/get is the **response item** schema, not the query shape. Query shape goes in `querySchema`.
- Do not inline `{ db, getSession }` into individual route files — always import the pre-bound `postOperation` / `getListOperation` / … from `@backend/utils/route-operation` so session/DB swaps are one-file changes.
- `jsonb` columns declared with `jsonb(...)` carry no zod info — extend the matching insert/select schema with `.merge(z.object({ field: z.array(z.string()).optional() }))` to keep typing accurate.
- Swallowing errors: an unhandled throw in a handler propagates to next-rest-framework as a 500. Provide `onError` for any operation exposed to untrusted clients.
- For non-CRUD behavior (middleware chains, streaming, multipart, `TypedNextResponse` unions, RPC) stop using these factories and switch to the `create-next-rest-framework-api` skill.

## Escape Hatches

- Extra server-side filters — `setParams(req) => Promise<Record<string, unknown>>` on GET/GET_LIST; returned keys are merged into the filter.
- Extra columns on write — `setBody(req) => Promise<Partial<infer<IB>>>` on POST/PUT; returned fields are merged into the body before validation runs against `bodySchema`.
- Post-processing output — `onSuccess(data) => Promise<data>`; on GET_LIST the payload is `{ data, total }`.
- Error rewriting — `onError(err) => Promise<Response | undefined>`. Return `undefined` to rethrow.

## Imports

```
@ai0x0/utils/lib/backend                   // actions + route-operation + schemas (CJS, used by Next.js server bundle)
@ai0x0/utils/lib/backend/actions
@ai0x0/utils/lib/backend/route-operation
@ai0x0/utils/lib/backend/schemas
```

ESM consumers can substitute `/es/backend/...` instead of `/lib/backend/...` when Next.js resolves the `exports` map that way; prefer `/lib/backend` in Next.js projects because the server bundle is CommonJS.

## Done Criteria

- Route files contain zero hand-written `{ db, getSession }` wiring; all operations come from `@backend/utils/route-operation`.
- Each domain has a `table.ts` (columns + `createTableSchema`) and an `index.ts` (five zod schemas + re-exports).
- Every list endpoint accepts `current / pageSize / orderBy / orderDir / *AtFrom / *AtTo` and — where applicable — `jsonArrayFields` is declared.
- `byCreator` is explicitly set when the endpoint is admin-facing or otherwise crosses ownership boundaries.
- Non-CRUD endpoints are implemented via raw `routeOperation` + action helpers, not by forcing a CRUD factory.
- `next-rest-framework validate` / `generate` (from the partner skill) still pass — the factory values are plain `RouteOperationDefinition` and participate in OpenAPI generation.
