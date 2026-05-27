# @ai0x0/utils

AI0x0 shared utilities — backend CRUD factories for Next.js App Router + drizzle-orm, custom ESLint rules and presets.

## Backend (`src/backend/`)

Declarative CRUD factories on top of `next-rest-framework`, `drizzle-orm/pg-core`, `drizzle-zod`, and `zod`. Each factory returns a `RouteOperationDefinition` that plugs directly into `route({ … })`.

| Export                   | HTTP   | Description                              |
| ------------------------ | ------ | ---------------------------------------- |
| `createPostOperation`    | POST   | Create a record                          |
| `createGetOperation`     | GET    | Get one record by filters                |
| `createGetListOperation` | GET    | Paginated list with filters, sort, joins |
| `createPutOperation`     | PUT    | Update a record                          |
| `createDeleteOperation`  | DELETE | Delete a record                          |
| `createTableSchema`      | —      | Generate pg table + 5 Zod schemas        |

See [SKILL.md](./SKILL.md) for detailed workflow, setup, and escape hatches.

## SQLite Backend (`src/backend/sqlite/`)

Projects that use a local SQLite database can import the same CRUD factory surface from `@ai0x0/utils/es/backend/sqlite`.

```ts
import {
  createTableSchema,
  queryListSchema,
} from "@ai0x0/utils/es/backend/sqlite/schemas/index.js";
import {
  createGetOperation,
  createPostOperation,
} from "@ai0x0/utils/es/backend/sqlite/index.js";
```

The SQLite helpers mirror the PostgreSQL helpers, but use `drizzle-orm/sqlite-core`, SQLite `LIKE`, and `json_each(...)` for JSON-array filtering.

Focused SQLite coverage should verify:

1. `createTableSchema` generates SQLite tables with the base fields: `id`, `creatorId`, `editorId`, `accessedAt`, `createdAt`, and `updatedAt`.
2. `queryListSchema` preserves pagination defaults.
3. `createGetListAction` works with SQLite query builders that expose `.all()`.
4. `getListData` executes plain queries directly and does not depend on `next-rest-framework` RPC wrappers.
5. `createPostAction` and `createPutAction` normalize `*At` fields through `transformBody`.
6. String filters use SQLite `LIKE`, comma-separated id filters use `inArray`, JSON-array filters use `json_each(...)`, and date range filters map `createdAtFrom` / `createdAtTo` to the matching timestamp column.

Run the focused SQLite tests:

```bash
pnpm test -- src/__tests__/sqlite-actions.test.ts src/__tests__/sqlite-schemas.test.ts
```

Run the full package checks before publishing:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
npm pack --dry-run --json
```

## Agent Skills

This package also ships reusable project skills under `.agents/skills`:

| Skill                 | Covers                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `ai0x0-utils/backend` | CRUD factories, drizzle schemas, route-operation setup, action helpers                            |
| `nextjs`              | App Router directories, API routes, drizzle schemas, OpenAPI client generation, code organization |
| `antd`                | Ant Design forms, ProTable, ModalForm, token-based styling, ahooks data flow                      |
| `cloudflare`          | OpenNext, Cloudflare Workers, Wrangler, Hyperdrive, Neon, deploy and runtime troubleshooting      |

To use them in a project, copy the packaged skills into the project root:

```bash
cp -R node_modules/@ai0x0/utils/.agents ./
```

After copying, Codex/agents can load them from `.agents/skills/<name>/SKILL.md`.

If the project already has local skills, copy only the packaged skill folders you need:

```bash
mkdir -p .agents/skills
cp -R node_modules/@ai0x0/utils/.agents/skills/nextjs .agents/skills/
cp -R node_modules/@ai0x0/utils/.agents/skills/antd .agents/skills/
cp -R node_modules/@ai0x0/utils/.agents/skills/cloudflare .agents/skills/
mkdir -p .agents/skills/ai0x0-utils
cp -R node_modules/@ai0x0/utils/.agents/skills/ai0x0-utils/backend .agents/skills/ai0x0-utils/
```

## ESLint Rules & Config

### Plugin (`eslint-rules/`)

Custom ESLint 9 flat-config rules. All enabled via `configs.recommended`:

```js
// eslint.config.js
import { ai0x0 } from "@ai0x0/utils/eslint-config/index.js";

export default [
  ai0x0.configs.recommended,
  // ... other config
];
```

| Rule                      | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `no-hardcoded-style`      | Forbid hardcoded style values                                           |
| `no-one-letter-vars`      | Forbid single-letter variable names                                     |
| `no-then`                 | Prefer `async/await` over `.then()`                                     |
| `no-antd-space`           | Use `<Flex>` instead of `<Space>`                                       |
| `require-pro-components`  | Require ProComponents usage                                             |
| `require-section-divider` | Large files need `===` comment dividers                                 |
| `no-consecutive-setstate` | Merge consecutive `setState` calls                                      |
| `no-use-request-run`      | Forbid `useRequest.run()`                                               |
| `require-use-form`        | Use `useForm()` for form state                                          |
| `require-form-convention` | Form naming conventions                                                 |
| `max-lines`               | Limit each file to 500 code lines and prompt splitting into child files |

### Shared restrictions (`eslint-config/`)

Pre-defined `no-restricted-syntax` selectors for antd + ahooks convention enforcement:

```js
import {
  ai0x0,
  allRestrictions,
  allRestrictionsWithNetworking,
} from "@ai0x0/utils/eslint-config/index.js";

export default [
  ai0x0.configs.recommended,
  // ... Prettier + TypeScript configs ...
  // Backend code
  {
    files: ["app/(backend)/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...allRestrictions] },
  },
  // Frontend code (also restricts fetch / WebSocket)
  {
    files: ["app/(frontend)/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...allRestrictionsWithNetworking],
    },
  },
];
```

Restrictions cover: `TryStatement`, `as` (non-const), `useState`, `useEffect`, `useMemo`, `useCallback`, native `div/span/p/h` tags, hardcoded colors, `fetch` and `new WebSocket()`.

## Installation

```bash
pnpm add @ai0x0/utils
```

Peer dependencies: `drizzle-orm ^0.45.x`, `drizzle-zod ^0.8.x`, `next ^16.x`, `next-rest-framework`, `zod ^4.x`.

## Docs

- [SKILL.md](./SKILL.md) — full backend CRUD workflow and API reference
- [.agents/skills/ai0x0-utils/backend/SKILL.md](./.agents/skills/ai0x0-utils/backend/SKILL.md) — packaged backend CRUD skill
- [.agents/skills/nextjs/SKILL.md](./.agents/skills/nextjs/SKILL.md) — Next.js project conventions
- [.agents/skills/antd/SKILL.md](./.agents/skills/antd/SKILL.md) — Ant Design frontend conventions
- [.agents/skills/cloudflare/SKILL.md](./.agents/skills/cloudflare/SKILL.md) — Cloudflare Workers deployment conventions
