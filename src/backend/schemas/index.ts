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
import type { Table } from "drizzle-orm";

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

// basicFields 中需要从业务 insert/update schema 中排除的字段。
// update 保留 id（必填），其他基础字段都由后端自动维护。
const basicInsertOmit = {
  id: true,
  creatorId: true,
  editorId: true,
  accessedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const basicUpdateOmit = {
  creatorId: true,
  editorId: true,
  accessedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * 基于 drizzle-zod 生成业务侧 insert schema，自动排除 basicFields
 * （id / creatorId / editorId / accessedAt / createdAt / updatedAt）。
 */
export const createInsertBodySchema = <T extends Table>(table: T) =>
  (createInsertSchema(table) as unknown as ZodObject).omit(basicInsertOmit);

/**
 * 基于 drizzle-zod 生成业务侧 update schema，保留 id 为必填，
 * 其余 basicFields 全部排除。
 */
export const createUpdateBodySchema = <T extends Table>(table: T) =>
  (createUpdateSchema(table) as unknown as ZodObject)
    .omit(basicUpdateOmit)
    .required({ id: true });

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
 *
 * 关键点：把合并后的 `basicFields & TColumnsMap` 交给 pgTable 时同时
 * 提供显式泛型参数，返回的 table 会携带完整列类型；drizzle-zod 由此
 * 推导出的 selectSchema 才是强类型的，而不是退化成
 * `z.ZodObject<Record<string, any[] | null>>`。
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
  // id 用 defaultRandom() 避免进入 insert 必填；随后在 zod 层把 id 标为必填
  const updateSchema = createUpdateSchema(
    pgTable(name, { id: uuid("id"), ...columns }),
  ).extend({ id: z.string() });

  // querySchema / queryListSchema 使用手写 zod，避免 selectSchema 泛型通过 .pick / .partial
  // 扩散，导致外部类型声明过长（TS7056）。运行时行为不变。
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
