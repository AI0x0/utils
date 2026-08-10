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
// 说明写成 `.describe()` 而不是行末注释：注释只有读源码的人看得到，而这七个字段会出现在每一个
// list 端点的 OpenAPI spec 里，再从那里流进生成的 client 与 CLI 文档。写成注释的代价是下游只能
// 自己再手写一份 —— 那份必然会漂，而且漂了没有任何东西会报错。
//
// 类型是 string 而不是 number：query 参数在线上只有字符串，服务端收下之后才转数字。默认值也
// 因此是 "1" / "10"。
export const queryListSchema = <Incoming extends ZodObject>(schema: Incoming) =>
  z
    .object({
      current: z
        .string()
        .optional()
        .default("1")
        .describe("Page number, starting at 1."),
      pageSize: z
        .string()
        .optional()
        .default("10")
        .describe(
          "Rows per page. Omitting it yields only 10 — pass a larger value to get the whole set.",
        ),
      createdAtFrom: z
        .string()
        .optional()
        .describe(
          "Keep only rows created at or after this instant (ISO 8601, e.g. 2026-08-01T00:00:00Z).",
        ),
      createdAtTo: z
        .string()
        .optional()
        .describe("Keep only rows created at or before this instant."),
      orderBy: z
        .string()
        .optional()
        .describe(
          "Column to sort by — a column name of this resource (createdAt / updatedAt and the like).",
        ),
      creatorId: z
        .string()
        .optional()
        .describe(
          "Keep only rows created by this user. Useful in shared spaces to filter down to one member.",
        ),
      orderDir: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort ascending or descending."),
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
// 给基础字段挂说明
// =============================================================================
// basicFields 是 drizzle 列，而 drizzle 列没有「描述」这个概念 —— 所以说明只能挂在
// drizzle-zod 出来的 schema 上。值得做是因为这六个字段出现在**每一张表**的 select schema 里：
// 一处写完，所有 list / get 端点的返回字段都有说明了。
//
// 一律只挂元数据，**不换类型**：`.describe()` / `.meta()` 返回的是带元数据的克隆，校验行为一模
// 一样。selectSchema 是有人拿去 safeParse 的（本包自己的测试就在用 Date 校验它），换类型等于改
// 这个包的契约。
//
// 时间戳那三列额外用 `.meta()` 补上 JSON Schema 表示，因为不补就是错的：drizzle-zod 给的是
// `z.date()`，而 `Date` 在 JSON Schema 里表达不出来，于是这三个字段在 spec 里是**空对象** ——
// 没有 `type`，照 spec 生成的 client / CLI 只能得到 `unknown`。而线上根本不可能是 Date：响应一经
// JSON 序列化就是 ISO 8601 字符串。
//
// `.meta({ type, format })` 恰好只改「怎么描述」不改「怎么校验」：spec 里成为
// `{"type":"string","format":"date-time"}`，而 `safeParse(new Date())` 照样通过。
// 不用 `z.iso.datetime()` 换掉它，是因为那既改了校验（不再收 Date），又会往 JSON Schema 里塞一条
// 380 字节的正则 —— 乘上每张表几十 KB，而 `format` 已经把「按日期时间解析」说清楚了。
const BASIC_FIELD_NOTES: Record<string, string> = {
  creatorId:
    "User id of the creator. Stamped by the server; clients cannot send it.",
  editorId:
    "User id of whoever changed this row last. Stamped by the server; clients cannot send it.",
  id: "Primary key of this row (uuid).",
};

const BASIC_TIMESTAMP_NOTES: Record<string, string> = {
  accessedAt: "When this row was last accessed.",
  createdAt: "When this row was created.",
  updatedAt: "When this row was last modified.",
};

const describeBasicFields = <T extends ZodObject>(schema: T): T => {
  const overlay: Record<string, ZodType> = {};
  for (const [field, note] of Object.entries(BASIC_FIELD_NOTES)) {
    const existing = schema.shape[field] as ZodType | undefined;
    // 表里没这一列就跳过 —— 不给不存在的字段凭空造一个。
    if (existing) {
      overlay[field] = existing.describe(note);
    }
  }
  for (const [field, note] of Object.entries(BASIC_TIMESTAMP_NOTES)) {
    const existing = schema.shape[field] as ZodType | undefined;
    if (existing) {
      overlay[field] = existing.meta({
        description: note,
        format: "date-time",
        type: "string",
      } as Parameters<ZodType["meta"]>[0]);
    }
  }
  return schema.extend(overlay) as unknown as T;
};

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

  const selectSchema = describeBasicFields(createSelectSchema(table));
  // 只从 columns 推 —— basicFields 与 serverColumns 都由服务端写，不该出现在请求体里。
  const insertSchema = createInsertSchema(sqliteTable(name, columns));
  const updateSchema = createUpdateSchema(
    sqliteTable(name, { id: text("id"), ...columns }),
  ).extend({ id: z.string().describe("Id of the row to update.") });

  const querySchema = z.object({
    id: z.string().describe("Id of the row to fetch."),
  });
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
