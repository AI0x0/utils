import { getListQuery } from "./get-list-query";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { getListData } from "./get-list-data";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";

export function createGetAction<TTable extends BaseTable>({
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
      params,
      relations,
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

    return result;
  };
}
