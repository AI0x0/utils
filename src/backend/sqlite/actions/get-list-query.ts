// ==============================================================================
// 列表查询（SQLite）
// ==============================================================================
// 实现在 backend/actions/get-list-query-core，与 pg 那套共用。这里只给它两条 sqlite 专属的
// 原语：sqlite 的 like 本来就不区分大小写（没有 ilike），JSON 数组用 json_each 展开。

import { BaseTable, GetListRelations } from "@/backend/sqlite/types";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { Column, sql } from "drizzle-orm";
import { ScopeArg } from "@/backend/scope";
import {
  createGetListQuery,
  type ListQueryParams,
} from "@/backend/actions/get-list-query-core";

// pattern 由核心转义好再传进来（见 escapeLikePattern），但**转义符要自己声明**：sqlite 的 LIKE
// 不带 ESCAPE 子句时一个转义符都没有，那样转义等于没做，`%` 照旧是通配符。这也是这里不能用
// drizzle 的 like() 助手的原因 —— 它拼不出 ESCAPE。
const run = createGetListQuery({
  contains: (column: Column, pattern: string) =>
    sql`${column} LIKE ${pattern} ESCAPE '\\'`,
  // json_each 展开出来的行里，值在 tag.value 上（pg 那个 _text 变体是直接给字符串的）——
  // 这是两边唯一一处连字段名都不同的地方。
  jsonArrayContains: (column: Column, pattern: string) => sql`
    EXISTS (
      SELECT 1 FROM json_each(${column}) tag
      WHERE tag.value LIKE ${pattern} ESCAPE '\\'
    )
  `,
});

export function getListQuery<
  TTable extends BaseTable,
  TSelection extends SelectedFields,
>(args: {
  // 与改动前一致：sqlite 侧从来没有收紧过 db 的类型。
  db: any;
  fields: TSelection;
  /** 允许被当成筛选条件的键。不传等于不限制，见核心里的说明。 */
  filterable?: readonly string[];
  jsonArrayFields?: string[];
  /** 必填。与 pg 那套同义，见 backend/scope.ts。 */
  scope: ScopeArg;
  params: ListQueryParams;
  relations?: GetListRelations;
  table: TTable;
}) {
  return run(args);
}
