import { z, ZodSchema } from "zod";
import { BaseTable, GetListRelations } from "@/backend/types";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListQuery } from "@/backend/actions/get-list-query";
import { getListData } from "@/backend/actions/get-list-data";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ScopeArg } from "@/backend/scope";

export function createGetListAction<
  T extends ZodSchema,
  TTable extends BaseTable,
>({
  bodySchema,
  db,
  jsonArrayFields,
  relations,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<Record<string, unknown>>;
  jsonArrayFields?: string[];
  relations?: GetListRelations;
  table: TTable;
}) {
  return async (
    params: Partial<z.infer<T>> & Record<string, unknown>,
    // 作用域必填，不隔离就显式 NO_SCOPE。理由见 backend/scope.ts 第 2 条。
    { scope }: { scope: ScopeArg },
  ) => {
    const { current, pageSize, ...other } = params as Record<
      string,
      unknown
    > & { current?: number; pageSize?: number };
    // 响应 schema 的字段集 = 调用方读得到的那些列。它同时决定两件事：**查什么**（下面的
    // fields）和**能按什么筛**（filterable）。两者必须是同一份 —— 否则一个只返回 id / title 的
    // 列表照样能 `?secret=sk-a` 让数据库去 ilike，再从 total 上把那一列逐字符读出来。
    // @ts-ignore
    const exposed: string[] = Object.keys(bodySchema.shape);
    const fields: SelectedFields = {};

    for (const key of exposed) {
      // @ts-ignore
      const field = table[key];
      if (field) {
        fields[key] = field;
      }
    }
    const { query, countQuery } = getListQuery({
      db,
      fields,
      filterable: exposed,
      jsonArrayFields,
      params: other,
      relations,
      scope,
      table,
    });

    return getListData({
      bodySchema,
      countQuery,
      current,
      pageSize,
      query,
    })();
  };
}
