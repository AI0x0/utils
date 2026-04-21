import { z, ZodObject, ZodType } from "zod";
import {
  pgTable,
  timestamp,
  uuid,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import type { BuildExtraConfigColumns } from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";

//============================基本字段============================//
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const createdAt = () => timestamptz("created_at").notNull().defaultNow();
const updatedAt = () => timestamptz("updated_at").notNull().defaultNow();
const accessedAt = () => timestamptz("accessed_at").notNull().defaultNow();

export const basicFields = {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorId: uuid("creator_id"),
  editorId: uuid("editor_id"),
  accessedAt: accessedAt(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};

/**
 * 业务侧 insert schema 需要从 drizzle-zod 生成的 schema 中排除的基础字段。
 * 这些字段由后端在 createPostAction 中自动写入。
 *
 * 使用方式（在业务 schema 中）：
 *   const insertFooSchema = createInsertSchema(foos)
 *     .omit(BASIC_INSERT_OMIT)
 *     .extend({ ... });
 *
 * 说明：上游导出为 const 而不是 helper function，是为了避免经过泛型
 * wrapper 后 TS 把 drizzle-zod 推导出的深层条件 Shape 归约成 Omit，
 * 从而在下游 `.extend(...)` 时丢失原有字段类型。
 */
export const BASIC_INSERT_OMIT = {
  id: true,
  creatorId: true,
  editorId: true,
  accessedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * 业务侧 update schema 需要从 drizzle-zod 生成的 schema 中排除的基础字段。
 * update 保留 id（随后用 `.required({ id: true })` 变成必填），其余由
 * 后端 createPutAction 自动维护。
 */
export const BASIC_UPDATE_OMIT = {
  creatorId: true,
  editorId: true,
  accessedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

//============================列表查询字段============================//
export const queryListSchema = <Incoming extends ZodObject>(schema: Incoming) =>
  z
    .object({
      current: z.string().optional().default("1"), // 默认页码为 1
      pageSize: z.string().optional().default("10"), // 默认每页条数为 10
      createdAtFrom: z.string().optional(), // 筛选开始日期
      createdAtTo: z.string().optional(), // 筛选结束日期
      orderBy: z.string().optional(),
      creatorId: z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).optional(),
    })
    .merge(schema);

//============================列表返回字段============================//
export const listBodySchema = <T extends ZodType>(schema: T) =>
  z.object({
    total: z.number(),
    data: z.array(schema),
  });

//============================创建一个pg表============================//
/**
 * 基于 drizzle + drizzle-zod 快速生成带基础字段（id / 创建时间等）的
 * 表定义以及 select / insert / update / query / list zod schema。
 */
export const createTableSchema = <
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
>({
  name,
  columns,
  extraConfig,
}: {
  name: TTableName;
  columns: TColumnsMap;
  extraConfig?: (
    self: BuildExtraConfigColumns<
      TTableName,
      typeof basicFields & TColumnsMap,
      "pg"
    >,
  ) => PgTableExtraConfigValue[];
}) => {
  const mergedColumns = { ...basicFields, ...columns } as typeof basicFields &
    TColumnsMap;

  const table = pgTable<TTableName, typeof basicFields & TColumnsMap>(
    name,
    mergedColumns,
    extraConfig,
  );

  const selectSchema = createSelectSchema(table);
  const insertSchema = createInsertSchema(pgTable(name, columns));
  const updateSchema = createUpdateSchema(
    pgTable(name, { id: uuid("id"), ...columns }),
  ).extend({ id: z.string() });

  const querySchema = z.object({ id: z.string() });
  const queryListWithSchema = queryListSchema(
    z.object({}).catchall(z.unknown()),
  );

  return {
    table,
    selectSchema,
    insertSchema,
    updateSchema,
    querySchema,
    queryListSchema: queryListWithSchema,
    queryListSelectSchema: selectSchema,
  };
};
