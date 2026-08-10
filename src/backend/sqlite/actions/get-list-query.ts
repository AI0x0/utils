// ==============================================================================
// 列表查询（SQLite）
// ==============================================================================
// 实现在 backend/actions/get-list-query-core，与 pg 那套共用。这里只给它两条 sqlite 专属的
// 原语：sqlite 的 like 本来就不区分大小写（没有 ilike），JSON 数组用 json_each 展开。

import { BaseTable, GetListRelations } from "@/backend/sqlite/types";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { Column, like, sql } from "drizzle-orm";
import { ScopeArg } from "@/backend/scope";
import {
  createGetListQuery,
  type ListQueryParams,
} from "@/backend/actions/get-list-query-core";

const run = createGetListQuery({
  contains: (column: Column, keyword: string) => like(column, `%${keyword}%`),
  // json_each 展开出来的行里，值在 tag.value 上（pg 那个 _text 变体是直接给字符串的）——
  // 这是两边唯一一处连字段名都不同的地方。
  jsonArrayContains: (column: Column, keyword: string) => sql`
    EXISTS (
      SELECT 1 FROM json_each(${column}) tag
      WHERE tag.value LIKE ${`%${keyword}%`}
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
  jsonArrayFields?: string[];
  /** 必填。与 pg 那套同义，见 backend/scope.ts。 */
  scope: ScopeArg;
  params: ListQueryParams;
  relations?: GetListRelations;
  table: TTable;
}) {
  return run(args);
}
