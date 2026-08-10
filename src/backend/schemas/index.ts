import { z } from "zod";
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

// =============================================================================
// 基本字段 —— 每张表都注入的那几列
// =============================================================================
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

// =============================================================================
// 与方言无关的那几份助手
// =============================================================================
// BASIC_INSERT_OMIT / BASIC_UPDATE_OMIT / queryListSchema / listBodySchema / describeFields
// 都只碰 zod，两套方言逐字相同 —— 实现搬去了 schemas/common，这里原样转出去，调用方的
// import 路径一个字都不用改。
// createTableSchema 自己也要用其中几个 —— `export ... from` 只转发、不把名字带进
// 本地作用域，所以这里还得再 import 一次。
import { describeBasicFields, describeFields, queryListSchema } from "./common";

export {
  BASIC_INSERT_OMIT,
  BASIC_UPDATE_OMIT,
  describeFields,
  listBodySchema,
  queryListSchema,
} from "./common";

// =============================================================================
// 建表 —— 表 + 5 份 zod schema
// =============================================================================
/**
 * 基于 drizzle + drizzle-zod 快速生成带基础字段（id / 创建时间等）的
 * 表定义以及 select / insert / update / query / list zod schema。
 */
export const createTableSchema = <
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
  TServerColumns extends Record<string, PgColumnBuilderBase> = {},
>({
  name,
  columns,
  serverColumns,
  extraConfig,
  describe,
}: {
  /** 客户端能写的业务列。insert / update schema 只从这里推。 */
  columns: TColumnsMap;
  /**
   * 每一列的说明，键是列名。**同时挂到 insert / update / select 三份 schema 上** —— 同一列在
   * 请求体里和响应里是同一个东西，说明没有理由写两遍。
   *
   * 为什么需要这个参数：drizzle 列没有「描述」这个概念，而 `.describe()` 只能挂在 zod 上。不给
   * 这条路，业务侧就只能在每张表后面自己把三份 schema 各 `.extend()` 一遍 —— 那是三份副本，
   * 而副本会漂。
   *
   * 键有类型约束（列名的联合），所以列改名了、拼错了都是编译错误，不是静默失效。
   *
   * 说明会出现在 OpenAPI spec 里，再流进按 spec 生成的 client 与文档 —— 所以它是写给调用方
   * 看的：这一列是什么、合法值从哪来、不传会怎样。
   */
  describe?: Partial<
    Record<Extract<keyof TColumnsMap | keyof TServerColumns, string>, string>
  >;
  name: TTableName;
  /**
   * 由服务端盖、**绝不接受客户端传**的业务列：承载归属的 `ownerId`（配合
   * `access.scope.column` 用）、租户 id 这一类。
   *
   * 它们照常进表、照常出现在 `selectSchema` 里（读得到），只是**不进 insert / update
   * schema** —— 与 basicFields 里的 creatorId / editorId 完全一样的待遇，只不过那几列是库
   * 自己加的，而归属列是业务自己声明的，库没有依据认出它特殊，所以要你放进这个桶。
   *
   * 为什么值得单独一个参数：让客户端能传归属列，等于让它自己挑这行数据算谁的，那就是越权
   * 本身。而「每张表都记得手动把它 omit 掉」是靠不住的 —— 漏掉一张不会编译报错，只会静默
   * 放行。列写在哪个桶里，能不能被客户端写就定了，没有可漏的余地。
   */
  serverColumns?: TServerColumns;
  extraConfig?: (
    self: BuildExtraConfigColumns<
      TTableName,
      typeof basicFields & TServerColumns & TColumnsMap,
      "pg"
    >,
  ) => PgTableExtraConfigValue[];
}) => {
  const mergedColumns = {
    ...basicFields,
    ...serverColumns,
    ...columns,
  } as typeof basicFields & TServerColumns & TColumnsMap;

  const table = pgTable<
    TTableName,
    typeof basicFields & TServerColumns & TColumnsMap
  >(name, mergedColumns, extraConfig);

  // 同一份说明喂给三份 schema：含哪些列各不相同，describeFields 会跳过不存在的。
  const notes = (describe ?? {}) as Record<string, string>;

  const selectSchema = describeFields(
    describeBasicFields(createSelectSchema(table)),
    notes,
  );
  // 只从 columns 推 —— basicFields 与 serverColumns 都由服务端写，不该出现在请求体里。
  const insertSchema = describeFields(
    createInsertSchema(pgTable(name, columns)),
    notes,
  );
  const updateSchema = describeFields(
    createUpdateSchema(pgTable(name, { id: uuid("id"), ...columns })).extend({
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
