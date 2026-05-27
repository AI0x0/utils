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
  return async (params: Record<string, unknown>) => {
    const { current, pageSize, ...other } = params as Record<
      string,
      unknown
    > & { current?: number; pageSize?: number };
    const fields: SelectedFields = {};
    for (const key of Object.keys(bodySchema.shape)) {
      const field = table[key as keyof TTable];
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
