---
name: ai0x0-utils-backend
description: Scaffold App Router CRUD endpoints and drizzle-orm(pg) tables with `@ai0x0/utils`. Use when a Next.js App Router project needs standard list/get/create/update/delete routes backed by drizzle-orm + zod + next-rest-framework, auto-injected base fields (id / creatorId / createdAt…), paginated list queries with joins, or ready-to-use select/insert/update Zod schemas. Pairs with the `create-next-rest-framework-api` skill — this skill replaces hand-written `routeOperation(...).input(...).outputs(...).handler(...)` chains with a declarative factory API.
---

# @ai0x0/utils Backend

Declarative CRUD factory on top of `next-rest-framework` v6, `drizzle-orm/pg-core`, `drizzle-zod`, and `zod` v4.

## Relationship with next-rest-framework

- Each `create*Operation` factory in this package returns a `RouteOperationDefinition<Method>` — the same value a hand-written `routeOperation(...).handler(...)` returns.
- Assign it directly to `GET/POST/PUT/DELETE` in an App Router `route.ts`.
- Middleware, form-data handlers, RPC routes, Pages Router, and OpenAPI customization are **not** owned by this skill. For those, switch to `create-next-rest-framework-api`.

## Workflow

1. Define table + schemas with `createTableSchema` (one call yields a drizzle `Table` plus `select/insert/update/query/queryList` Zod schemas with base fields auto-added).
2. Create one factory options object `{ db, getSession }` per project/module. `getSession(req)` must return `{ userId?: string } | undefined`.
3. In each `route.ts`, export `GET/POST/PUT/DELETE` by calling the matching `create*Operation(factoryOpts)({ table, bodySchema, ... })`.
4. Reuse action-level helpers (`createGetAction`, `createGetListAction`, …) inside server actions, cron jobs, or queue workers — same signature, no request wrapping.
5. Drop down to raw `routeOperation` (via the `create-next-rest-framework-api` skill) only when you need middleware, custom content types, multi-output status, or non-CRUD semantics.

## Factory Catalog

| Export                   | Purpose                | Key options                                                                                        |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `createTableSchema`      | pg table + zod schemas | `name`, `columns`, `refineSchema?`, `extraConfig?`                                                 |
| `createGetOperation`     | GET one by filters     | `table`, `bodySchema`, `querySchema`, `setParams?`, `relations?`, `byCreator?`                     |
| `createGetListOperation` | GET paginated list     | `table`, `bodySchema`, `querySchema`, `relations?`, `jsonArrayFields?`, `setParams?`, `onSuccess?` |
| `createPostOperation`    | POST create            | `table`, `bodySchema`, `outputBodySchema?`, `setBody?`, `onSuccess?`                               |
| `createPutOperation`     | PUT update             | `table`, `bodySchema`, `outputBodySchema?`, `setBody?`, `byCreator?`                               |
| `createDeleteOperation`  | DELETE                 | `table`, `byCreator?`, `onSuccess?`                                                                |

All operations additionally accept `summary` (fills OpenAPI summary) and `onError(err) => Promise<Response | undefined>`.

## Minimal Example

```ts
// lib/posts/schemas.ts
import { createTableSchema } from "@ai0x0/utils/backend/schemas";
import { text, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

export const {
  table: postsTable,
  selectSchema,
  insertSchema,
  updateSchema,
  querySchema,
  queryListSchema,
} = createTableSchema({
  name: "posts",
  columns: {
    title: text("title").notNull(),
    views: integer("views").default(0),
  },
  refineSchema: { title: z.string().min(1).max(200) },
});
```

```ts
// app/api/posts/route.ts
import { db } from "@/db";
import { getSession } from "@/auth";
import {
  createGetListOperation,
  createPostOperation,
} from "@ai0x0/utils/backend";
import {
  postsTable,
  selectSchema,
  insertSchema,
  queryListSchema,
} from "@/lib/posts/schemas";

const opts = { db, getSession };

export const GET = createGetListOperation(opts)({
  table: postsTable,
  bodySchema: selectSchema,
  querySchema: queryListSchema,
});

export const POST = createPostOperation(opts)({
  table: postsTable,
  bodySchema: insertSchema,
});
```

```ts
// app/api/posts/[id]/route.ts
import {
  createGetOperation,
  createPutOperation,
  createDeleteOperation,
} from "@ai0x0/utils/backend";
import {
  postsTable,
  selectSchema,
  updateSchema,
  querySchema,
} from "@/lib/posts/schemas";

const opts = { db, getSession };
export const GET = createGetOperation(opts)({
  table: postsTable,
  bodySchema: selectSchema,
  querySchema,
});
export const PUT = createPutOperation(opts)({
  table: postsTable,
  bodySchema: updateSchema,
});
export const DELETE = createDeleteOperation(opts)({ table: postsTable });
```

## Built-in Conventions

- **Base fields** auto-added by `createTableSchema`: `id` (uuid, pk, default random) / `creatorId` / `editorId` / `accessedAt` / `createdAt` / `updatedAt`.
- **Ownership check**: with `byCreator: true` (default), PUT/DELETE pre-fetch the row filtered by `creatorId = session.userId` and throw `"未找到…对象，或没有权限"` if missing. Set `byCreator: false` to skip.
- **Auto injection**: POST writes `creatorId = session.userId`; PUT writes `editorId = session.userId`.
- **Date coercion**: any body field ending in `At` is passed through `dayjs(value).toDate()` before write — accept ISO strings from clients.
- **List filtering** (via querystring, all strings):
  - `key=a,b,c` → `IN (...)` when key ends with `Id`; otherwise `OR ILIKE %a% OR ILIKE %b%`
  - `key=foo` where key ends with `Id` → `eq`; otherwise `ILIKE %foo%`
  - `createdAtFrom` / `createdAtTo` → `gte` / `lte` (works for any `${field}AtFrom|To`)
  - `jsonArrayFields: ["tags"]` → `EXISTS (SELECT 1 FROM jsonb_array_elements_text(col) t WHERE t LIKE %v%)`
- **Pagination / sort**: `current` (default `"1"`), `pageSize` (default `"10"`), `orderBy` (default `createdAt`), `orderDir` (`asc|desc`, default `desc`).
- **Relations**: `relations: [{ table, sql, select, groupBy? }]` drives `leftJoin` + optional `groupBy(root.id, join.id)`; `select` merges into the final `SELECT` projection.

## Guardrails

- `getSession(req)` MUST return `{ userId?: string } | undefined`. Throwing is fine; returning wrong shape silently disables ownership checks.
- Query-string values are strings — keep `querySchema` fields as `z.string()` or use `queryListSchema()` to wrap your partial schema.
- Do not reuse `insertSchema` on PUT; the write path expects `id` on PUT (`updateSchema` already requires it).
- `bodySchema` passed to list/get operations is the **response item** schema, not the query shape. Put query shape in `querySchema`.
- Only use `outputBodySchema` to override response on POST/PUT. Leaving it unset defaults POST to `{ id: string }` and PUT to `z.void()`.
- When you need anything beyond CRUD (middleware, streaming, multipart, multiple output statuses), stop using these factories and fall back to raw `routeOperation` — see the `create-next-rest-framework-api` skill.

## Escape Hatches

- Need extra filters server-side? Use `setParams(req) => Promise<Record<string, unknown>>` on GET/GET_LIST — returned keys are merged into the query filter.
- Need to stamp extra columns on write? Use `setBody(req) => Promise<Partial<infer<IB>>>` on POST/PUT — returned fields are merged into body.
- Need to post-process output? Use `onSuccess(data) => Promise<data>`; for lists, receives `{ data, total }`.
- Need to swallow / rewrite errors? Use `onError(err) => Promise<Response | undefined>`. Return `undefined` to rethrow.

## Imports

```
@ai0x0/utils/backend                   // actions + route-operation + schemas
@ai0x0/utils/backend/actions           // createGetAction / createPostAction / ...
@ai0x0/utils/backend/route-operation   // createGetOperation / createPostOperation / ...
@ai0x0/utils/backend/schemas           // createTableSchema / queryListSchema / listBodySchema / basicFields
```

## Done Criteria

- `route.ts` compiles without explicit handler typing — factories return `RouteOperationDefinition<Method>`.
- Ownership is enforced where intended (`byCreator` matches the product requirement).
- `queryListSchema` wraps the partial item shape and the list endpoint accepts `current / pageSize / orderBy / orderDir / *AtFrom / *AtTo`.
- `onError` is defined for any operation exposed to untrusted clients; otherwise unhandled exceptions become 500s.
- For non-CRUD needs the route is implemented via `create-next-rest-framework-api` instead of forcing a factory.
