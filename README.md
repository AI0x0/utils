# @ai0x0/utils

AI0x0 shared utilities — backend CRUD factories for Next.js App Router + drizzle-orm, and custom ESLint rules.

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

**Built-in conventions:** base fields (`id`, `creatorId`, `editorId`, `createdAt`, `updatedAt`, `accessedAt`), ownership checks via `byCreator`, automatic date coercion, pagination (`current`/`pageSize`/`orderBy`/`orderDir`), list filtering with `ILIKE`, `IN`, `jsonb` array matching, and relation joins.

See [SKILL.md](./SKILL.md) for detailed workflow, setup, and escape hatches.

## ESLint Rules (`eslint-rules/`)

Custom ESLint 9 flat-config rules ported from production projects. All enabled via `configs.recommended`:

```js
// eslint.config.js
import localPlugin from "./eslint-rules/index.js";

export default [
  localPlugin.configs.recommended,
  // ... other config
];
```

| Rule                      | Description                             |
| ------------------------- | --------------------------------------- |
| `no-hardcoded-style`      | Forbid hardcoded style values           |
| `no-one-letter-vars`      | Forbid single-letter variable names     |
| `no-then`                 | Prefer `async/await` over `.then()`     |
| `no-antd-space`           | Use `<Flex>` instead of `<Space>`       |
| `require-pro-components`  | Require ProComponents usage             |
| `require-section-divider` | Large files need `===` comment dividers |
| `no-consecutive-setstate` | Merge consecutive `setState` calls      |
| `no-use-request-run`      | Forbid `useRequest.run()`               |
| `require-use-form`        | Use `useForm()` for form state          |
| `require-form-convention` | Form naming conventions                 |

## Installation

```bash
pnpm add @ai0x0/utils
```

Peer dependencies: `drizzle-orm ^0.45.x`, `drizzle-zod ^0.8.x`, `zod ^4.x`.

## Docs

- [SKILL.md](./SKILL.md) — full backend CRUD workflow and API reference
