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
    const fields: SelectedFields = {};

    // @ts-ignore
    for (const key of Object.keys(bodySchema.shape)) {
      // @ts-ignore
      const field = table[key];
      if (field) {
        fields[key] = field;
      }
    }
    const { query, countQuery } = getListQuery({
      db,
      fields,
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
