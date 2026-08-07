import { z, ZodObject, ZodType } from "zod";
import {
  integer,
  sqliteTable,
  text,
  type SQLiteColumnBuilderBase,
  type SQLiteTableExtraConfigValue,
} from "drizzle-orm/sqlite-core";
import type { BuildExtraConfigColumns } from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";

// =============================================================================
// 基本字段 —— 每张表都注入的那几列
// =============================================================================
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

const now = () => new Date();
const id = () => crypto.randomUUID();
const createdAt = () => timestamp("created_at").notNull().$defaultFn(now);
const updatedAt = () => timestamp("updated_at").notNull().$defaultFn(now);
const accessedAt = () => timestamp("accessed_at").notNull().$defaultFn(now);

export const basicFields = {
  id: text("id").primaryKey().$defaultFn(id),
  creatorId: text("creator_id"),
  editorId: text("editor_id"),
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

// =============================================================================
// 列表查询字段
// =============================================================================
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

// =============================================================================
// 列表返回字段
// =============================================================================
export const listBodySchema = <T extends ZodType>(schema: T) =>
  z.object({
    total: z.number(),
    data: z.array(schema),
  });

// =============================================================================
// 建表 —— 表 + 5 份 zod schema
// =============================================================================
/**
 * 基于 drizzle + drizzle-zod 快速生成带基础字段（id / 创建时间等）的
 * 表定义以及 select / insert / update / query / list zod schema。
 */
export const createTableSchema: <
  TTableName extends string,
  TColumnsMap extends Record<string, SQLiteColumnBuilderBase>,
>(_options: {
  name: TTableName;
  /** 客户端能写的业务列。insert / update schema 只从这里推。 */
  columns: TColumnsMap;
  /** 由服务端盖、绝不接受客户端传的业务列（归属、租户 id 这类）。语义与 pg 版一致，见那边的说明。 */
  serverColumns?: Record<string, SQLiteColumnBuilderBase>;
  extraConfig?: (
    _self: BuildExtraConfigColumns<
      TTableName,
      typeof basicFields & TColumnsMap,
      "sqlite"
    >,
  ) => SQLiteTableExtraConfigValue[];
}) => {
  table: any;
  selectSchema: any;
  insertSchema: any;
  updateSchema: any;
  querySchema: any;
  queryListSchema: any;
  queryListSelectSchema: any;
} = ({ name, columns, serverColumns, extraConfig }) => {
  const mergedColumns = {
    ...basicFields,
    ...serverColumns,
    ...columns,
  } as typeof basicFields & Record<string, SQLiteColumnBuilderBase>;

  const table = sqliteTable(
    name,
    mergedColumns,
    extraConfig as never,
  ) as unknown as ReturnType<typeof sqliteTable>;

  const selectSchema = createSelectSchema(table);
  // 只从 columns 推 —— basicFields 与 serverColumns 都由服务端写，不该出现在请求体里。
  const insertSchema = createInsertSchema(sqliteTable(name, columns));
  const updateSchema = createUpdateSchema(
    sqliteTable(name, { id: text("id"), ...columns }),
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
