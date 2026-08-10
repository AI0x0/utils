import { z } from "zod";
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

// =============================================================================
// 与方言无关的那几份助手
// =============================================================================
// BASIC_INSERT_OMIT / BASIC_UPDATE_OMIT / queryListSchema / listBodySchema / describeFields
// 都只碰 zod，两套方言逐字相同 —— 实现搬去了 schemas/common，这里原样转出去，调用方的
// import 路径一个字都不用改。
// createTableSchema 自己也要用其中几个 —— `export ... from` 只转发、不把名字带进
// 本地作用域，所以这里还得再 import 一次。
import {
  describeBasicFields,
  describeFields,
  queryListSchema,
} from "@/backend/schemas/common";

export {
  BASIC_INSERT_OMIT,
  BASIC_UPDATE_OMIT,
  describeFields,
  listBodySchema,
  queryListSchema,
} from "@/backend/schemas/common";

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
  /**
   * 每一列的说明，键是列名。同时挂到 insert / update / select 三份 schema 上。语义与 pg 版
   * 一致，见那边的说明。
   */
  describe?: Partial<Record<string, string>>;
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
} = ({ name, columns, serverColumns, extraConfig, describe }) => {
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

  // 同一份说明喂给三份 schema：含哪些列各不相同，describeFields 会跳过不存在的。
  const notes = (describe ?? {}) as Record<string, string>;

  const selectSchema = describeFields(
    describeBasicFields(createSelectSchema(table)),
    notes,
  );
  // 只从 columns 推 —— basicFields 与 serverColumns 都由服务端写，不该出现在请求体里。
  const insertSchema = describeFields(
    createInsertSchema(sqliteTable(name, columns)),
    notes,
  );
  const updateSchema = describeFields(
    createUpdateSchema(
      sqliteTable(name, { id: text("id"), ...columns }),
    ).extend({
      id: z.string().describe("Id of the row to update."),
    }),
    notes,
  );

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
