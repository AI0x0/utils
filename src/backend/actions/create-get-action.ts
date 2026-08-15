import { z, ZodSchema } from "zod";
import { getListQuery } from "./get-list-query";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListData } from "./get-list-data";
import { BaseTable, GetListRelations } from "@/backend/types";
import { ScopeArg } from "@/backend/scope";

export function createGetAction<T extends ZodSchema, TTable extends BaseTable>({
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
    // 筛选面与可见面同源，理由见 create-get-list-action 里的同一段。
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
      params,
      relations,
      scope,
      table,
    });

    const {
      data: [result],
    } = await getListData({
      bodySchema,
      countQuery,
      current: 1,
      pageSize: 1,
      query,
    })();

    return result as z.infer<T> | undefined;
  };
}
