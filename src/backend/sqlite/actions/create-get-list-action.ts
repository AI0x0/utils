import { ScopeArg } from "@/backend/scope";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { getListQuery } from "@/backend/sqlite/actions/get-list-query";
import { getListData } from "@/backend/sqlite/actions/get-list-data";

export function createGetListAction<TTable extends BaseTable>({
  bodySchema,
  db,
  jsonArrayFields,
  relations,
  table,
}: {
  bodySchema: any;
  db: any;
  jsonArrayFields?: string[];
  relations?: GetListRelations;
  table: TTable;
}) {
  return async (
    params: Record<string, unknown>,
    // 必填，不隔离就显式 NO_SCOPE。
    { scope }: { scope: ScopeArg },
  ) => {
    const { current, pageSize, ...other } = params as Record<
      string,
      unknown
    > & { current?: number; pageSize?: number };
    // 筛选面与可见面同源，理由见 backend/actions/create-get-list-action 里的同一段。
    const exposed: string[] = Object.keys(bodySchema.shape);
    const fields: SelectedFields = {};
    for (const key of exposed) {
      const field = table[key as keyof TTable];
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
      scope,
      relations,
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
