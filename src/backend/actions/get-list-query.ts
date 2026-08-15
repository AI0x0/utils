// ==============================================================================
// 列表查询（Postgres）
// ==============================================================================
// 实现在 get-list-query-core，两套方言共用。这里只给它两条 pg 专属的原语，外加把签名收紧到
// pg 的类型上 —— 核心为了同时喂 sqlite，db 那一栏是宽的，调用方不该跟着变宽。

import { BaseTable, GetListRelations } from "@/backend/types";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { Column, ilike, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ScopeArg } from "@/backend/scope";
import {
  createGetListQuery,
  type ListQueryParams,
} from "./get-list-query-core";

// pattern 由核心转义好再传进来（见 escapeLikePattern）。pg 这边不用写 ESCAPE 子句：
// LIKE / ILIKE 默认就拿反斜杠当转义符，而模式串是绑定参数，不经过字符串字面量那套解析。
const run = createGetListQuery({
  contains: (column: Column, pattern: string) => ilike(column, pattern),
  // jsonb 数组展开成行再逐个 LIKE。列存的是 text[] 形状的 jsonb（见 createTableSchema 的
  // jsonArrayFields），所以用 _text 那个变体，取到的 tag 直接就是字符串。
  jsonArrayContains: (column: Column, pattern: string) => sql`
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${column}) tag
      WHERE tag LIKE ${pattern}
    )
  `,
});

export function getListQuery<
  TTable extends BaseTable,
  TSelection extends SelectedFields,
>(args: {
  db: NodePgDatabase<Record<string, unknown>>;
  fields: TSelection;
  /** 允许被当成筛选条件的键。不传等于不限制，见核心里的说明。 */
  filterable?: readonly string[];
  jsonArrayFields?: string[];
  /**
   * 行级作用域。**必填**，不想隔离就显式传 NO_SCOPE —— 写成可选的话，漏传就退化成查全表，
   * 而那是静默的越权（见 scope.ts）。
   */
  scope: ScopeArg;
  params: ListQueryParams;
  relations?: GetListRelations;
  table: TTable;
}) {
  return run(args);
}
